-- NULL means no expiration; existing keys retain their chosen expiry.
alter table private.api_keys alter column expires_at drop not null;

create or replace function public.create_api_key(target uuid, key_name text, key_permission text, days integer) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare secret text; key_id uuid;
begin
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  perform 1 from public.organizations where id=target for update;
  if (days is not null and days not in (30,90,365)) or key_permission not in ('read','read_write') or key_permission is null
    or char_length(trim(key_name)) not between 2 and 60 or key_name is null then raise exception 'Invalid key options'; end if;
  if (select count(*) from private.api_keys where org_id=target and revoked_at is null and (expires_at is null or expires_at>now()))>=20
    then raise exception 'Limit of 20 active keys reached'; end if;
  secret := 'forma_' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.api_keys(org_id,created_by,name,key_hash,prefix,permission,expires_at)
  values(target,auth.uid(),trim(key_name),encode(extensions.digest(secret,'sha256'),'hex'),left(secret,14),key_permission,
    case when days is null then null else now()+make_interval(days=>days) end)
  returning id into key_id;
  return jsonb_build_object('id',key_id,'secret',secret);
end;
$fn$;

-- Explicitly allow no expiry while retaining revocation, membership, scope, and rate checks.
create or replace function public.consume_api_key(token_digest text, required_permission text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare k private.api_keys; stamp timestamptz:=clock_timestamp();
begin
  select * into k from private.api_keys where key_hash=token_digest for update;
  if not found or k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=stamp) then return jsonb_build_object('status',401); end if;
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

revoke all on function public.create_api_key(uuid,text,text,integer) from public, anon;
grant execute on function public.create_api_key(uuid,text,text,integer) to authenticated;
revoke all on function public.consume_api_key(text,text) from public, anon, authenticated;
grant execute on function public.consume_api_key(text,text) to service_role;
