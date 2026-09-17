-- M1: ordinary signups only. Trusted invitation acceptance is a later migration.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  created_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

create function private.is_verified_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = (select auth.uid()) and email_confirmed_at is not null);
$$;
create function private.is_org_member(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_verified_user() and exists (
    select 1 from public.organization_members where org_id = target and user_id = (select auth.uid())
  );
$$;
create function private.can_manage_org(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_verified_user() and exists (
    select 1 from public.organization_members where org_id = target and user_id = (select auth.uid()) and role in ('owner', 'admin')
  );
$$;
revoke all on function private.is_verified_user(), private.is_org_member(uuid), private.can_manage_org(uuid) from public, anon;
grant execute on function private.is_verified_user(), private.is_org_member(uuid), private.can_manage_org(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
revoke all on public.profiles, public.organizations, public.organization_members from anon, authenticated;
grant select on public.profiles, public.organizations, public.organization_members to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant update(name) on public.organizations to authenticated;

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) and (select private.is_verified_user()));
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid()) and (select private.is_verified_user()))
with check (id = (select auth.uid()) and (select private.is_verified_user()));
create policy organizations_read on public.organizations for select to authenticated
using ((select private.is_org_member(id)));
create policy organizations_update on public.organizations for update to authenticated
using ((select private.can_manage_org(id))) with check ((select private.can_manage_org(id)));
create policy members_read on public.organization_members for select to authenticated
using ((select private.is_org_member(org_id)));

create function private.bootstrap_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  workspace_id uuid := gen_random_uuid();
  display_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'My'), 60);
begin
  insert into public.profiles(id, full_name) values (new.id, display_name);
  insert into public.organizations(id, name, slug)
    values (workspace_id, left(display_name || '''s workspace', 80), 'workspace-' || replace(workspace_id::text, '-', ''));
  insert into public.organization_members(org_id, user_id, role) values (workspace_id, new.id, 'owner');
  return new;
end;
$$;
revoke all on function private.bootstrap_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.bootstrap_user();
