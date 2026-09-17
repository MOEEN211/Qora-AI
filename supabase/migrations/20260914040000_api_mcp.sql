-- Supabase Auth owns OAuth codes, tokens and refresh. These are app permissions.
create table private.integration_settings(singleton boolean primary key default true check(singleton),audience text not null);
create table private.mcp_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 org_id uuid not null references public.organizations(id) on delete cascade,
 client_id uuid not null references auth.oauth_clients(id) on delete cascade,
 client_name text not null check(char_length(client_name) between 1 and 200),
 permission text not null check(permission in ('read','read_write')),
 created_at timestamptz not null default now(),revoked_at timestamptz,last_used_at timestamptz,
 window_start timestamptz not null default now(),request_count integer not null default 0
);
create unique index mcp_connections_active on private.mcp_connections(user_id,client_id) where revoked_at is null;
create index mcp_connections_org on private.mcp_connections(org_id,user_id);
-- Bind every refresh-token session to its original consent generation. A later
-- reconnect must never revive an older connection's refresh token.
create table private.mcp_token_sessions(session_id uuid primary key,connection_id uuid not null references private.mcp_connections(id) on delete cascade);
alter table private.mcp_token_sessions enable row level security;
revoke all on private.mcp_token_sessions from public,anon,authenticated;
alter table private.integration_settings enable row level security;
alter table private.mcp_connections enable row level security;
revoke all on private.integration_settings,private.mcp_connections from public,anon,authenticated;

create function public.save_mcp_connection(target uuid,oauth_client uuid,display_name text,access_level text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.can_manage_org(target) or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 if access_level is null or access_level not in ('read','read_write') or display_name is null or char_length(display_name) not between 1 and 200 then raise invalid_parameter_value;end if;
 perform 1 from public.organizations where id=target for update;
 if not private.can_manage_org(target) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||oauth_client::text,0));
 update private.mcp_connections set revoked_at=now() where user_id=auth.uid() and client_id=oauth_client and revoked_at is null;
 insert into private.mcp_connections(user_id,org_id,client_id,client_name,permission)
 values(auth.uid(),target,oauth_client,display_name,access_level) returning id into result;
 return result;
end $$;
create function public.list_mcp_connections() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'client_id',c.client_id,'name',c.client_name,'workspace',o.name,'permission',c.permission,'last_used_at',c.last_used_at) order by c.created_at desc)
 from private.mcp_connections c join public.organizations o on o.id=c.org_id where c.user_id=auth.uid() and c.revoked_at is null),'[]'::jsonb);
end $$;
create function public.revoke_mcp_connection(connection_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare client uuid;
begin
 if not private.is_verified_user() or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 update private.mcp_connections set revoked_at=coalesce(revoked_at,now()) where id=connection_id and user_id=auth.uid() returning client_id into client;
 if client is null then raise insufficient_privilege;end if;
 return client;
end $$;
create function private.revoke_member_mcp_connections() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' or new.role='member' then
 update private.mcp_connections set revoked_at=coalesce(revoked_at,now()) where org_id=old.org_id and user_id=old.user_id;
 end if;
 return null;
end $$;
create trigger revoke_member_mcp after delete or update of role on public.organization_members for each row execute function private.revoke_member_mcp_connections();

-- OAuth tokens have no ordinary app database privileges. Direct login is untouched.
create function public.mcp_access_token_hook(event jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare claims jsonb:=event->'claims';connection private.mcp_connections;audience text;
begin
 if claims->>'client_id' is null then return event;end if;
 select * into connection from private.mcp_connections where user_id=(event->>'user_id')::uuid and client_id=(claims->>'client_id')::uuid and revoked_at is null;
 select s.audience into audience from private.integration_settings s where singleton;
 if connection.id is null or audience is null then raise exception 'Approve an application connection before requesting a token';end if;
 insert into private.mcp_token_sessions(session_id,connection_id) values((claims->>'session_id')::uuid,connection.id) on conflict(session_id) do nothing;
 select c.* into connection from private.mcp_token_sessions s join private.mcp_connections c on c.id=s.connection_id
 where s.session_id=(claims->>'session_id')::uuid and c.revoked_at is null and c.user_id=(event->>'user_id')::uuid and c.client_id=(claims->>'client_id')::uuid;
 if connection.id is null then raise exception 'This connection was revoked; authorize a new connection';end if;
 claims:=jsonb_set(claims,'{aud}',to_jsonb(audience));
 claims:=jsonb_set(claims,'{role}','"anon"'::jsonb);
 claims:=jsonb_set(claims,'{forma_connection}',to_jsonb(connection.id));
 return jsonb_build_object('claims',claims);
end $$;
grant usage on schema private to supabase_auth_admin;
grant select on private.integration_settings,private.mcp_connections to supabase_auth_admin;
grant select,insert on private.mcp_token_sessions to supabase_auth_admin;
create policy auth_hook_sessions_read on private.mcp_token_sessions for select to supabase_auth_admin using(true);
create policy auth_hook_sessions_insert on private.mcp_token_sessions for insert to supabase_auth_admin with check(true);
create policy auth_hook_settings on private.integration_settings for select to supabase_auth_admin using(true);
create policy auth_hook_connections on private.mcp_connections for select to supabase_auth_admin using(true);

create function public.consume_mcp_connection(connection_id uuid,token_user uuid,token_client uuid,token_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.mcp_connections;stamp timestamptz:=clock_timestamp();
begin
 select * into c from private.mcp_connections where id=connection_id for update;
 if not found or c.revoked_at is not null or c.user_id<>token_user or c.client_id<>token_client
 or not exists(select 1 from auth.sessions s where s.id=token_session and s.user_id=token_user and s.oauth_client_id=token_client and (s.not_after is null or s.not_after>stamp))
 or not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=c.org_id and m.user_id=c.user_id and m.role in ('owner','admin') and u.email_confirmed_at is not null)
 then return jsonb_build_object('status',401);end if;
 if c.window_start<=stamp-interval '1 minute' then c.window_start:=stamp;c.request_count:=0;end if;
 if c.request_count>=60 then return jsonb_build_object('status',429);end if;
 update private.mcp_connections set last_used_at=stamp,window_start=c.window_start,request_count=c.request_count+1 where id=c.id;
 return jsonb_build_object('status',200,'org_id',c.org_id,'permission',c.permission,'credential_id',c.id);
end $$;
create or replace function public.consume_api_key(token_digest text,required_permission text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k private.api_keys;stamp timestamptz:=clock_timestamp();
begin
 select * into k from private.api_keys where key_hash=token_digest for update;
 if not found or k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=stamp) then return jsonb_build_object('status',401);end if;
 if not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=k.org_id and m.user_id=k.created_by and m.role in ('owner','admin') and u.email_confirmed_at is not null) then return jsonb_build_object('status',401);end if;
 if required_permission not in ('read','write') or required_permission is null or (required_permission='write' and k.permission<>'read_write') then return jsonb_build_object('status',403);end if;
 if k.window_start<=stamp-interval '1 minute' then k.window_start:=stamp;k.request_count:=0;end if;
 if k.request_count>=60 then return jsonb_build_object('status',429);end if;
 update private.api_keys set last_used_at=stamp,window_start=k.window_start,request_count=k.request_count+1 where id=k.id;
 return jsonb_build_object('status',200,'org_id',k.org_id,'permission',k.permission,'credential_id',k.id);
end $$;
revoke all on function public.save_mcp_connection(uuid,uuid,text,text),public.list_mcp_connections(),public.revoke_mcp_connection(uuid),public.consume_mcp_connection(uuid,uuid,uuid,uuid),public.mcp_access_token_hook(jsonb),private.revoke_member_mcp_connections() from public,anon,authenticated;
grant execute on function public.save_mcp_connection(uuid,uuid,text,text),public.list_mcp_connections(),public.revoke_mcp_connection(uuid) to authenticated;
grant execute on function public.consume_mcp_connection(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.mcp_access_token_hook(jsonb) to supabase_auth_admin;
