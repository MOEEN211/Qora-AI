-- Profile photos remain private; only the owner can read/write their object.
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint own_avatar_path
  check (avatar_path is null or avatar_path = id::text || '/avatar.webp');
grant update(avatar_path) on public.profiles to authenticated;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/webp']);
create policy avatar_read on storage.objects for select to authenticated
using (bucket_id='avatars' and name=(select auth.uid())::text || '/avatar.webp' and private.is_verified_user());
create policy avatar_insert on storage.objects for insert to authenticated
with check (bucket_id='avatars' and name=(select auth.uid())::text || '/avatar.webp' and private.is_verified_user());
create policy avatar_update on storage.objects for update to authenticated
using (bucket_id='avatars' and name=(select auth.uid())::text || '/avatar.webp' and private.is_verified_user())
with check (bucket_id='avatars' and name=(select auth.uid())::text || '/avatar.webp' and private.is_verified_user());
create policy avatar_delete on storage.objects for delete to authenticated
using (bucket_id='avatars' and name=(select auth.uid())::text || '/avatar.webp' and private.is_verified_user());

create table private.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  key_hash text not null unique,
  prefix text not null,
  permission text not null check (permission in ('read', 'read_write')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);
create index api_keys_org_idx on private.api_keys(org_id);
create index api_keys_creator_idx on private.api_keys(created_by);
alter table private.api_keys enable row level security;
revoke all on private.api_keys from public, anon, authenticated;

create function public.list_api_keys(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'prefix',prefix,'permission',permission,
    'created_at',created_at,'expires_at',expires_at,'last_used_at',last_used_at,'revoked_at',revoked_at
  ) order by created_at desc) from private.api_keys where org_id=target), '[]'::jsonb);
end;
$fn$;

create function public.create_api_key(target uuid, key_name text, key_permission text, days integer) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare secret text; key_id uuid;
begin
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  perform 1 from public.organizations where id=target for update;
  if days not in (30,90,365) or days is null or key_permission not in ('read','read_write') or key_permission is null
    or char_length(trim(key_name)) not between 2 and 60 or key_name is null then raise exception 'Invalid key options'; end if;
  if (select count(*) from private.api_keys where org_id=target and revoked_at is null and expires_at>now())>=20
    then raise exception 'Limit of 20 active keys reached'; end if;
  secret := 'forma_' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.api_keys(org_id,created_by,name,key_hash,prefix,permission,expires_at)
  values(target,auth.uid(),trim(key_name),encode(extensions.digest(secret,'sha256'),'hex'),left(secret,14),key_permission,now()+make_interval(days=>days))
  returning id into key_id;
  return jsonb_build_object('id',key_id,'secret',secret);
end;
$fn$;

create function public.revoke_api_key(target uuid, key_id uuid) returns void
language plpgsql security definer set search_path='' as $fn$
begin
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  update private.api_keys set revoked_at=coalesce(revoked_at,now()) where id=key_id and org_id=target;
  if not found then raise exception 'Key not found'; end if;
end;
$fn$;

-- Only the application server can exchange a digest for a workspace. No bearer secret is stored.
create function public.consume_api_key(token_digest text, required_permission text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare k private.api_keys; stamp timestamptz:=clock_timestamp();
begin
  select * into k from private.api_keys where key_hash=token_digest for update;
  if not found or k.revoked_at is not null or k.expires_at<=stamp then return jsonb_build_object('status',401); end if;
  if not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id
    where m.org_id=k.org_id and m.user_id=k.created_by and m.role in ('owner','admin') and u.email_confirmed_at is not null)
    then return jsonb_build_object('status',401); end if;
  if required_permission not in ('read','write') or required_permission is null
    or (required_permission='write' and k.permission<>'read_write') then return jsonb_build_object('status',403); end if;
  if k.window_start<=stamp-interval '1 minute' then k.window_start:=stamp; k.request_count:=0; end if;
  if k.request_count>=60 then return jsonb_build_object('status',429); end if;
  update private.api_keys set last_used_at=stamp,window_start=k.window_start,request_count=k.request_count+1 where id=k.id;
  return jsonb_build_object('status',200,'org_id',k.org_id);
end;
$fn$;

create function public.account_deletion_summary() returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
  if not private.is_verified_user() then raise exception 'Not permitted'; end if;
  return jsonb_build_object(
    'personal_workspaces',coalesce((select jsonb_agg(o.name) from public.organizations o
      join public.organization_members m on m.org_id=o.id where m.user_id=auth.uid() and m.role='owner'
      and (select count(*) from public.organization_members x where x.org_id=o.id)=1),'[]'::jsonb),
    'blocked_workspaces',coalesce((select jsonb_agg(o.name) from public.organizations o
      join public.organization_members m on m.org_id=o.id where m.user_id=auth.uid() and m.role='owner'
      and exists(select 1 from public.organization_members x where x.org_id=o.id and x.user_id<>auth.uid())
      and not exists(select 1 from public.organization_members x where x.org_id=o.id and x.user_id<>auth.uid() and x.role='owner')),'[]'::jsonb)
  );
end;
$fn$;

-- Runs inside Auth's own deletion transaction, so refusal cannot leave orphaned workspaces.
create function private.guard_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
  -- Billing has not shipped. Fail closed if a later billing migration is added without integrating deletion.
  if to_regclass('public.subscriptions') is not null then raise exception 'Resolve billing before deleting accounts'; end if;
  perform o.id from public.organizations o join public.organization_members m on m.org_id=o.id
    where m.user_id=old.id order by o.id for update of o;
  if exists(select 1 from public.organization_members m where m.user_id=old.id and m.role='owner'
    and exists(select 1 from public.organization_members x where x.org_id=m.org_id and x.user_id<>old.id)
    and not exists(select 1 from public.organization_members x where x.org_id=m.org_id and x.user_id<>old.id and x.role='owner'))
    then raise exception 'Transfer workspace ownership before deleting your account'; end if;
  delete from public.organizations o using public.organization_members m
    where m.org_id=o.id and m.user_id=old.id and m.role='owner'
    and not exists(select 1 from public.organization_members x where x.org_id=o.id and x.user_id<>old.id);
  return old;
end;
$fn$;
revoke all on function private.guard_account_deletion() from public,anon,authenticated;
create trigger before_auth_user_deleted before delete on auth.users for each row execute function private.guard_account_deletion();

revoke all on function public.list_api_keys(uuid), public.create_api_key(uuid,text,text,integer),
  public.revoke_api_key(uuid,uuid), public.consume_api_key(text,text), public.account_deletion_summary() from public,anon,authenticated;
grant execute on function public.list_api_keys(uuid), public.create_api_key(uuid,text,text,integer),
  public.revoke_api_key(uuid,uuid), public.account_deletion_summary() to authenticated;
grant execute on function public.consume_api_key(text,text) to service_role;
