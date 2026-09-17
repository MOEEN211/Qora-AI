-- Dedicated hosted target only. Every fixture and mutation rolls back.
begin;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true),
 set_config('test.client',gen_random_uuid()::text,true),set_config('test.session',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values
 (current_setting('test.a')::uuid,'mcp-a-'||current_setting('test.a')||'@example.invalid',now(),'{"full_name":"MCP A"}','authenticated','authenticated'),
 (current_setting('test.b')::uuid,'mcp-b-'||current_setting('test.b')||'@example.invalid',now(),'{"full_name":"MCP B"}','authenticated','authenticated');
select set_config('test.org_a',(select org_id::text from public.organization_members where user_id=current_setting('test.a')::uuid),true),
 set_config('test.org_b',(select org_id::text from public.organization_members where user_id=current_setting('test.b')::uuid),true);
insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method,client_name)
 values(current_setting('test.client')::uuid,'manual','http://localhost:3000/callback','authorization_code,refresh_token','public','none','SQL fixture');
insert into auth.sessions(id,user_id,oauth_client_id,created_at,updated_at)
 values(current_setting('test.session')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,now(),now());
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('test.connection',public.save_mcp_connection(current_setting('test.org_a')::uuid,current_setting('test.client')::uuid,'SQL fixture','read')::text,true);
do $test$ begin
 if jsonb_array_length(public.list_mcp_connections())<>1 then raise exception 'Own connection missing';end if;
 begin
  perform public.save_mcp_connection(current_setting('test.org_b')::uuid,current_setting('test.client')::uuid,'Forbidden','read_write');
  raise exception 'Foreign workspace consent succeeded';
 exception when insufficient_privilege then null;end;
 begin
  perform 1 from private.mcp_connections;
  raise exception 'Connection table is user-readable';
 exception when insufficient_privilege then null;end;
 begin
  perform public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid);
  raise exception 'Authenticated user called service exchange';
 exception when insufficient_privilege then null;end;
 begin
  perform public.mcp_access_token_hook('{}');raise exception 'User called token hook';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.b'),'role','authenticated')::text,true);
set local role authenticated;
do $test$ begin
 if public.list_mcp_connections()<>'[]'::jsonb then raise exception 'Foreign connection exposed';end if;
 begin
  perform public.revoke_mcp_connection(current_setting('test.connection')::uuid);raise exception 'Foreign connection revoked';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;

-- Managed Postgres cannot SET ROLE supabase_auth_admin. Check its grants here;
-- the browser token-exchange test exercises the provider's actual hook execution.
do $test$ declare normal jsonb;result jsonb;begin
 if not has_function_privilege('supabase_auth_admin','public.mcp_access_token_hook(jsonb)','EXECUTE')
 or not has_table_privilege('supabase_auth_admin','private.mcp_connections','SELECT')
 or not has_table_privilege('supabase_auth_admin','private.mcp_token_sessions','INSERT') then raise exception 'Provider hook privileges missing';end if;
 normal:=jsonb_build_object('user_id',current_setting('test.a'),'claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','aud','authenticated'));
 if public.mcp_access_token_hook(normal)<>normal then raise exception 'Normal sign-in claims changed';end if;
 result:=public.mcp_access_token_hook(jsonb_build_object('user_id',current_setting('test.a'),'claims',jsonb_build_object('client_id',current_setting('test.client'),'session_id',current_setting('test.session'),'role','authenticated','aud','authenticated')));
 if result->'claims'->>'role'<>'anon' or result->'claims'->>'forma_connection'<>current_setting('test.connection')
 or result->'claims'->>'aud'<>(select audience from private.integration_settings where singleton) then raise exception 'OAuth token not downscoped';end if;
end $test$;
reset role;

-- Even a simulated OAuth token with an authenticated role cannot self-authorize.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated','client_id',current_setting('test.client'))::text,true);
set local role authenticated;
do $test$ begin
 begin
  perform public.save_mcp_connection(current_setting('test.org_a')::uuid,current_setting('test.client')::uuid,'Escalation','read_write');raise exception 'OAuth token escalated its grant';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;
set local role anon;
do $test$ begin
 begin
  perform 1 from public.organizations;raise exception 'OAuth role reads ordinary app tables';
 exception when insufficient_privilege then null;end;
 begin
  perform public.list_mcp_connections();raise exception 'OAuth role lists user connections';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;

set local role service_role;
do $test$ declare result jsonb;begin
 result:=public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid);
 if result->>'status'<>'200' or result->>'org_id'<>current_setting('test.org_a') or result->>'permission'<>'read' then raise exception 'Wrong connection principal';end if;
 if public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.b')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid)->>'status'<>'401' then raise exception 'Foreign user accepted';end if;
 if public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,gen_random_uuid(),current_setting('test.session')::uuid)->>'status'<>'401' then raise exception 'Foreign client accepted';end if;
 if public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,gen_random_uuid())->>'status'<>'401' then raise exception 'Missing session accepted';end if;
 for i in 2..60 loop perform public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid);end loop;
 if public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid)->>'status'<>'429' then raise exception 'Connection quota bypassed';end if;
end $test$;
reset role;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated')::text,true);
update auth.oauth_clients set deleted_at=now() where id=current_setting('test.client')::uuid;
do $test$ begin
 if public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid)->>'status'<>'401' then raise exception 'Deleted OAuth client accepted';end if;
end $test$;
update auth.oauth_clients set deleted_at=null where id=current_setting('test.client')::uuid;
set local role authenticated;
select public.revoke_mcp_connection(current_setting('test.connection')::uuid);
do $test$ begin
 if jsonb_array_length(public.list_mcp_connections())<>1 then raise exception 'Failed cleanup cannot be retried';end if;
 perform public.complete_mcp_disconnect(current_setting('test.connection')::uuid);
 if public.list_mcp_connections()<>'[]'::jsonb then raise exception 'Completed disconnect remains visible';end if;
end $test$;
select set_config('test.new_connection',public.save_mcp_connection(current_setting('test.org_a')::uuid,current_setting('test.client')::uuid,'Reconnected','read_write')::text,true);
reset role;
do $test$ begin
 begin
  perform public.mcp_access_token_hook(jsonb_build_object('user_id',current_setting('test.a'),'claims',jsonb_build_object('client_id',current_setting('test.client'),'session_id',current_setting('test.session'))));
  raise exception 'Old refresh session revived by reconnect';
 exception when raise_exception then if sqlerrm<>'This connection was revoked; authorize a new connection' then raise;end if;end;
end $test$;
reset role;

-- Demotion and re-promotion must not revive old connection permissions.
insert into public.organization_members(org_id,user_id,role) values(current_setting('test.org_a')::uuid,current_setting('test.b')::uuid,'member');
select public.transfer_workspace_ownership(current_setting('test.org_a')::uuid,current_setting('test.b')::uuid);
update public.organization_members set role='member' where org_id=current_setting('test.org_a')::uuid and user_id=current_setting('test.a')::uuid;
update public.organization_members set role='admin' where org_id=current_setting('test.org_a')::uuid and user_id=current_setting('test.a')::uuid;
do $test$ begin
 if exists(select 1 from private.mcp_connections where user_id=current_setting('test.a')::uuid and revoked_at is null) then raise exception 'Demotion left an active connection';end if;
 if public.consume_mcp_connection(current_setting('test.connection')::uuid,current_setting('test.a')::uuid,current_setting('test.client')::uuid,current_setting('test.session')::uuid)->>'status'<>'401' then raise exception 'Revoked token resurrected';end if;
end $test$;
delete from public.organization_members where org_id=current_setting('test.org_a')::uuid and user_id=current_setting('test.a')::uuid;
update public.organizations set name='A private name after removal' where id=current_setting('test.org_a')::uuid;
set local role authenticated;
do $test$ begin
 if public.list_mcp_connections()::text like '%A private name after removal%' then raise exception 'Removed member sees live workspace name';end if;
 if public.list_mcp_connections()->0->>'workspace'<>'Unavailable workspace' then raise exception 'Removed connection cleanup inaccessible';end if;
end $test$;
reset role;
delete from public.organizations where id=current_setting('test.org_a')::uuid;
set local role authenticated;
do $test$ begin
 if public.list_mcp_connections()->0->>'workspace'<>'Deleted workspace' then raise exception 'Deleted workspace cleanup inaccessible';end if;
end $test$;
reset role;
delete from auth.users where id=current_setting('test.a')::uuid;
do $test$ begin
 if exists(select 1 from private.mcp_connections where user_id=current_setting('test.a')::uuid) then raise exception 'Deleted user connection survived';end if;
 if exists(select 1 from private.mcp_token_sessions where session_id=current_setting('test.session')::uuid) then raise exception 'Deleted connection session binding survived';end if;
end $test$;
rollback;
