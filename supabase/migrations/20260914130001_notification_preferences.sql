create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select on public.notification_preferences to authenticated;
grant update(email_enabled,in_app_enabled) on public.notification_preferences to authenticated;
create policy preferences_read on public.notification_preferences for select to authenticated
  using(user_id=(select auth.uid()) and (select private.is_verified_user()));
create policy preferences_update on public.notification_preferences for update to authenticated
  using(user_id=(select auth.uid()) and (select private.is_verified_user()))
  with check(user_id=(select auth.uid()) and (select private.is_verified_user()));

create function private.bootstrap_notification_preferences() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.notification_preferences(user_id) values(new.id);
  return new;
end;
$$;
revoke all on function private.bootstrap_notification_preferences() from public,anon,authenticated,service_role;
-- Alphabetically before on_auth_user_notification, in the same signup transaction.
create trigger on_auth_user_0_notification_preferences after insert on auth.users
  for each row execute function private.bootstrap_notification_preferences();
insert into public.notification_preferences(user_id) select id from auth.users on conflict do nothing;

-- Enforce the preference for EVERY in-app insertion, including future server writers.
-- The row lock serializes inserts with preference changes. Suppression creates no row.
create function private.check_in_app_notification_preference() returns trigger
language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
  select in_app_enabled into enabled from public.notification_preferences where user_id=new.user_id for share;
  if enabled is distinct from true then return null; end if;
  return new;
end;
$$;
revoke all on function private.check_in_app_notification_preference() from public,anon,authenticated,service_role;
create trigger notification_preference_before_insert before insert on public.notifications
  for each row execute function private.check_in_app_notification_preference();

-- Narrow server lookup: no Auth rows or other accounts' preferences are exposed to clients.
-- Unknown invitation recipients have no preferences yet. Deleted known users cannot receive welcome.
create function public.email_notifications_allowed(recipient text,person uuid default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare answer boolean;
begin
  if person is not null then
    select p.email_enabled into answer from auth.users u join public.notification_preferences p on p.user_id=u.id
      where u.id=person and lower(trim(u.email))=lower(trim(recipient));
    return coalesce(answer,false);
  end if;
  if not exists(select 1 from auth.users where lower(trim(email))=lower(trim(recipient))) then return true; end if;
  select bool_and(coalesce(p.email_enabled,false)) into answer from auth.users u
    left join public.notification_preferences p on p.user_id=u.id where lower(trim(u.email))=lower(trim(recipient));
  return coalesce(answer,false);
end;
$$;
revoke all on function public.email_notifications_allowed(text,uuid) from public,anon,authenticated;
grant execute on function public.email_notifications_allowed(text,uuid) to service_role;

alter table private.workspace_invitations drop constraint workspace_invitations_send_status_check;
alter table private.workspace_invitations add constraint workspace_invitations_send_status_check
  check(send_status in ('unknown','accepted','failed','suppressed'));
create or replace function public.record_invitation_send(invitation_id uuid,attempt uuid,status text) returns void
language sql security definer set search_path='' as $$
  update private.workspace_invitations set send_status=status where id=invitation_id and send_id=attempt
    and status in ('accepted','unknown','failed','suppressed');
$$;
