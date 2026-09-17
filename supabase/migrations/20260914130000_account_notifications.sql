-- Account inbox: independent of workspace membership and subscription state.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'message' check (char_length(kind) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_inbox_idx on public.notifications(user_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;
create unique index notifications_welcome_idx on public.notifications(user_id) where kind = 'welcome';
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_verified_user()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_verified_user()))
  with check (user_id = (select auth.uid()) and (select private.is_verified_user()));

-- The same defaults serve signup and backfill without replacing lifecycle triggers.
create function private.welcome_notification(target uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(user_id, kind, title, body)
  values (target, 'welcome', 'Welcome to your workspace',
    'You’re all set! Explore your workspace, make it your own, and start building. This is your notification inbox — you’ll find your updates here.')
  on conflict (user_id) where kind = 'welcome' do nothing;
$$;
create function private.bootstrap_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.welcome_notification(new.id);
  return new;
end;
$$;
revoke all on function private.welcome_notification(uuid), private.bootstrap_notification() from public, anon, authenticated, service_role;
create trigger on_auth_user_notification after insert on auth.users
  for each row execute function private.bootstrap_notification();

-- Existing accounts with an empty inbox receive the example once. Kickstart's
-- transactional checksum ledger and the unique index make retries safe.
do $$ begin
  perform private.welcome_notification(u.id) from auth.users u
  where not exists (select 1 from public.notifications n where n.user_id = u.id);
end $$;
