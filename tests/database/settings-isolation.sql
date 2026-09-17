-- Dedicated hosted project only. Everything in this script rolls back.
begin;
select set_config('test.a',gen_random_uuid()::text,true), set_config('test.b',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values
 (current_setting('test.a')::uuid,'settings-a-'||current_setting('test.a')||'@example.invalid',now(),'{"full_name":"Settings A"}','authenticated','authenticated'),
 (current_setting('test.b')::uuid,'settings-b-'||current_setting('test.b')||'@example.invalid',now(),'{"full_name":"Settings B"}','authenticated','authenticated');
select set_config('test.org_a',(select org_id::text from public.organization_members where user_id=current_setting('test.a')::uuid),true);
select set_config('test.org_b',(select org_id::text from public.organization_members where user_id=current_setting('test.b')::uuid),true);
insert into storage.objects(bucket_id,name) values('avatars',current_setting('test.a')||'/avatar.webp'),('avatars',current_setting('test.b')||'/avatar.webp');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ declare secret jsonb; count_rows integer; begin
  secret:=public.create_api_key(current_setting('test.org_a')::uuid,'Test reader','read',30);
  perform set_config('test.digest',encode(extensions.digest(secret->>'secret','sha256'),'hex'),true);
  perform set_config('test.key_id',secret->>'id',true);
  if public.list_api_keys(current_setting('test.org_a')::uuid)::text like '%key_hash%' then raise exception 'Hash leaked in key listing'; end if;
  begin
    perform public.create_api_key(current_setting('test.org_b')::uuid,'Forbidden','read',30);
    raise exception 'Cross-workspace key creation succeeded';
  exception when raise_exception then if sqlerrm<>'Not permitted' then raise; end if; end;
  begin
    perform public.list_api_keys(current_setting('test.org_b')::uuid);
    raise exception 'Cross-workspace key listing succeeded';
  exception when raise_exception then if sqlerrm<>'Not permitted' then raise; end if; end;
  begin
    perform public.consume_api_key(current_setting('test.digest'),'read');
    raise exception 'Authenticated role can call privileged key exchange';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.api_keys;
    raise exception 'Key table readable by user';
  exception when insufficient_privilege then null; end;
  if (select count(*) from storage.objects where bucket_id='avatars')<>1 then raise exception 'Avatar read isolation failed'; end if;
  update storage.objects set name='forbidden' where bucket_id='avatars' and name=current_setting('test.b')||'/avatar.webp';
  get diagnostics count_rows=row_count;
  if count_rows<>0 then raise exception 'Cross-user avatar mutation succeeded'; end if;
  begin
    update public.profiles set avatar_path=current_setting('test.b')||'/avatar.webp' where id=current_setting('test.a')::uuid;
    raise exception 'Foreign avatar path accepted';
  exception when check_violation then null; end;
end $test$;
reset role;
set local role service_role;
do $test$ declare response jsonb; begin
  response:=public.consume_api_key(current_setting('test.digest'),'read');
  if response->>'org_id'<>current_setting('test.org_a') or (response->>'status')::int<>200 then raise exception 'Key mapped to wrong workspace'; end if;
  if (public.consume_api_key(current_setting('test.digest'),'write')->>'status')::int<>403 then raise exception 'Read-only scope not enforced'; end if;
  for i in 2..60 loop perform public.consume_api_key(current_setting('test.digest'),'read'); end loop;
  if (public.consume_api_key(current_setting('test.digest'),'read')->>'status')::int<>429 then raise exception 'Rate limit not enforced'; end if;
end $test$;
reset role;
update private.api_keys set expires_at=now()-interval '1 day' where id=current_setting('test.key_id')::uuid;
do $test$ begin
  if (public.consume_api_key(current_setting('test.digest'),'read')->>'status')::int<>401 then raise exception 'Expired key accepted'; end if;
end $test$;
update private.api_keys set expires_at=now()+interval '1 day',window_start=now()-interval '2 minutes' where id=current_setting('test.key_id')::uuid;
set local role authenticated;
select public.revoke_api_key(current_setting('test.org_a')::uuid,current_setting('test.key_id')::uuid);
reset role;
do $test$ begin
  if (public.consume_api_key(current_setting('test.digest'),'read')->>'status')::int<>401 then raise exception 'Revoked key accepted'; end if;
end $test$;
-- Forever keys have no timestamp and still count toward the active-key quota.
set local role authenticated;
do $test$ declare key jsonb; begin
  key:=public.create_api_key(current_setting('test.org_a')::uuid,'Forever reader','read',null);
  perform set_config('test.forever_id',key->>'id',true);
  perform set_config('test.forever_digest',encode(extensions.digest(key->>'secret','sha256'),'hex'),true);
  if not exists(select 1 from jsonb_array_elements(public.list_api_keys(current_setting('test.org_a')::uuid)) item
    where item->>'id'=key->>'id' and item->'expires_at'='null'::jsonb) then raise exception 'Forever expiry not null in listing'; end if;
  for i in 2..20 loop perform public.create_api_key(current_setting('test.org_a')::uuid,'Forever '||i,'read_write',null); end loop;
  begin
    perform public.create_api_key(current_setting('test.org_a')::uuid,'Over limit','read',30);
    raise exception 'Forever keys bypass active quota';
  exception when raise_exception then if sqlerrm<>'Limit of 20 active keys reached' then raise; end if; end;
  begin
    perform public.create_api_key(current_setting('test.org_a')::uuid,'Invalid expiry','read',0);
    raise exception 'Invalid expiry accepted';
  exception when raise_exception then if sqlerrm<>'Invalid key options' then raise; end if; end;
end $test$;
reset role;
set local role service_role;
do $test$ begin
  if (public.consume_api_key(current_setting('test.forever_digest'),'read')->>'status')::int<>200 then raise exception 'Forever key rejected'; end if;
  if (public.consume_api_key(current_setting('test.forever_digest'),'write')->>'status')::int<>403 then raise exception 'Forever read-only scope not enforced'; end if;
  for i in 2..60 loop perform public.consume_api_key(current_setting('test.forever_digest'),'read'); end loop;
  if (public.consume_api_key(current_setting('test.forever_digest'),'read')->>'status')::int<>429 then raise exception 'Forever rate limit not enforced'; end if;
end $test$;
reset role;
set local role authenticated;
select public.revoke_api_key(current_setting('test.org_a')::uuid,current_setting('test.forever_id')::uuid);
do $test$ begin
  perform public.create_api_key(current_setting('test.org_a')::uuid,'Replacement forever','read',null);
end $test$;
reset role;
do $test$ begin
  if (public.consume_api_key(current_setting('test.forever_digest'),'read')->>'status')::int<>401 then raise exception 'Revoked forever key accepted'; end if;
end $test$;

-- A second member makes the workspace shared: its sole owner cannot be deleted.
insert into public.organization_members(org_id,user_id,role) values(current_setting('test.org_a')::uuid,current_setting('test.b')::uuid,'member');
do $test$ begin
  begin
    delete from auth.users where id=current_setting('test.a')::uuid;
    raise exception 'Sole shared owner was deleted';
  exception when raise_exception then if sqlerrm<>'Transfer workspace ownership before deleting your account' then raise; end if; end;
  if not exists(select 1 from auth.users where id=current_setting('test.a')::uuid) then raise exception 'Blocked deletion changed account'; end if;
end $test$;
-- Transferring sole ownership allows account removal and preserves the shared workspace.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated')::text,true);
select public.transfer_workspace_ownership(current_setting('test.org_a')::uuid,current_setting('test.b')::uuid);
delete from auth.users where id=current_setting('test.a')::uuid;
do $test$ begin
  if not exists(select 1 from public.organizations where id=current_setting('test.org_a')::uuid) then raise exception 'Shared workspace was deleted'; end if;
  if exists(select 1 from private.api_keys where created_by=current_setting('test.a')::uuid) then raise exception 'Deleted user keys survived'; end if;
end $test$;
set local role authenticated;
do $test$ begin
  if exists(select 1 from public.organizations) or exists(select 1 from storage.objects where bucket_id='avatars') then raise exception 'Deleted user stale claims retain access'; end if;
end $test$;
reset role;
-- Last remaining owner is the only member: deleting it removes both owned workspaces.
delete from auth.users where id=current_setting('test.b')::uuid;
do $test$ begin
  if exists(select 1 from public.organizations where id in (current_setting('test.org_a')::uuid,current_setting('test.org_b')::uuid)) then raise exception 'Personal workspace orphaned'; end if;
end $test$;
rollback;
