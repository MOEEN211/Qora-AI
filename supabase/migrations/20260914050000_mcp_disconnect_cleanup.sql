-- Keep revoked generations/session bindings, but expose retryable provider cleanup.
alter table private.mcp_connections add column provider_revoked_at timestamptz;
alter table private.mcp_connections alter column created_at set default clock_timestamp();
create or replace function public.list_mcp_connections() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'client_id',c.client_id,'name',c.client_name,'workspace',o.name,'permission',c.permission,'last_used_at',c.last_used_at,'revoked_at',c.revoked_at) order by c.created_at desc)
 from (select distinct on(client_id) * from private.mcp_connections where user_id=auth.uid() order by client_id,(revoked_at is null) desc,created_at desc,id desc) c
 join public.organizations o on o.id=c.org_id where c.revoked_at is null or c.provider_revoked_at is null),'[]'::jsonb);
end $$;
create function public.complete_mcp_disconnect(connection_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 update private.mcp_connections set provider_revoked_at=now() where id=connection_id and user_id=auth.uid() and revoked_at is not null;
 if not found then raise insufficient_privilege;end if;
end $$;
revoke all on function public.complete_mcp_disconnect(uuid) from public,anon,authenticated;
grant execute on function public.complete_mcp_disconnect(uuid) to authenticated;

-- Every call requires a still-active OAuth client and the original session grant.
create or replace function public.consume_mcp_connection(connection_id uuid,token_user uuid,token_client uuid,token_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.mcp_connections;stamp timestamptz:=clock_timestamp();
begin
 select * into c from private.mcp_connections where id=connection_id for update;
 if not found or c.revoked_at is not null or c.user_id<>token_user or c.client_id<>token_client
 or not exists(select 1 from auth.oauth_clients oc where oc.id=token_client and oc.deleted_at is null)
 or not exists(select 1 from auth.sessions s join private.mcp_token_sessions binding on binding.session_id=s.id
   where s.id=token_session and s.user_id=token_user and s.oauth_client_id=token_client and binding.connection_id=c.id and (s.not_after is null or s.not_after>stamp))
 or not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=c.org_id and m.user_id=c.user_id and m.role in ('owner','admin') and u.email_confirmed_at is not null)
 then return jsonb_build_object('status',401);end if;
 if c.window_start<=stamp-interval '1 minute' then c.window_start:=stamp;c.request_count:=0;end if;
 if c.request_count>=60 then return jsonb_build_object('status',429);end if;
 update private.mcp_connections set last_used_at=stamp,window_start=c.window_start,request_count=c.request_count+1 where id=c.id;
 return jsonb_build_object('status',200,'org_id',c.org_id,'permission',c.permission,'credential_id',c.id);
end $$;
