-- Account-scoped onboarding is independent of workspace bootstrap and billing.
create table public.onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  use_case text check (use_case in ('personal', 'work', 'exploring')),
  interests text[] not null default '{}' check (
    interests <@ array['dashboard','ai','team','integrations']::text[]
    and cardinality(interests) <= 4 and array_position(interests,null) is null
  ),
  current_step smallint not null default 1 check (current_step between 1 and 3),
  status text not null default 'in_progress' check (status in ('in_progress','completed','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  skipped_at timestamptz,
  constraint onboarding_completion_answers check (status <> 'completed' or
    (char_length(trim(display_name)) > 0 and use_case is not null and current_step = 3)),
  constraint onboarding_status_dates check (
    (status = 'in_progress' and completed_at is null and skipped_at is null) or
    (status = 'completed' and completed_at is not null and skipped_at is null) or
    (status = 'skipped' and skipped_at is not null and completed_at is null)
  )
);
alter table public.onboarding enable row level security;
revoke all on public.onboarding from public, anon, authenticated;
grant select on public.onboarding to authenticated;
grant update(display_name,use_case,interests,current_step,status) on public.onboarding to authenticated;
create policy onboarding_read on public.onboarding for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_verified_user()));
create policy onboarding_update on public.onboarding for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_verified_user()))
  with check (user_id = (select auth.uid()) and (select private.is_verified_user()));

create function private.bootstrap_onboarding() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.onboarding(user_id) values(new.id);
  return new;
end;
$$;
revoke all on function private.bootstrap_onboarding() from public,anon,authenticated,service_role;
create trigger on_auth_user_onboarding after insert on auth.users
  for each row execute function private.bootstrap_onboarding();
insert into public.onboarding(user_id) select id from auth.users on conflict do nothing;

-- Row locking serializes transitions. A delayed save in another tab cannot undo
-- either terminal choice, change its timestamp, or replace its saved answers.
create function private.guard_onboarding_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.status in ('completed','skipped') then return old; end if;
  new.updated_at := now();
  new.completed_at := case when new.status = 'completed' then now() else null end;
  new.skipped_at := case when new.status = 'skipped' then now() else null end;
  return new;
end;
$$;
revoke all on function private.guard_onboarding_update() from public,anon,authenticated,service_role;
create trigger onboarding_before_update before update on public.onboarding
  for each row execute function private.guard_onboarding_update();
