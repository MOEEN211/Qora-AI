-- Preserve a revoked consent record for provider cleanup after workspace deletion.
-- It must never retain access or expose the former workspace's current name.
alter table private.mcp_connections drop constraint mcp_connections_org_id_fkey;
alter table private.mcp_connections alter column org_id drop not null;
alter table private.mcp_connections add constraint mcp_connections_org_id_fkey foreign key(org_id) references public.organizations(id) on delete set null;
create function private.revoke_deleted_workspace_mcp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.mcp_connections set revoked_at=coalesce(revoked_at,now()) where org_id=old.id;
 return old;
end $$;
revoke all on function private.revoke_deleted_workspace_mcp() from public,anon,authenticated;
create trigger revoke_deleted_workspace_mcp before delete on public.organizations for each row execute function private.revoke_deleted_workspace_mcp();
create or replace function public.list_mcp_connections() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'client_id',c.client_id,'name',c.client_name,
 'workspace',case when c.org_id is null then 'Deleted workspace' when private.is_org_member(c.org_id) then o.name else 'Unavailable workspace' end,
 'permission',c.permission,'last_used_at',c.last_used_at,'revoked_at',c.revoked_at) order by c.created_at desc)
 from (select distinct on(client_id) * from private.mcp_connections where user_id=auth.uid() order by client_id,(revoked_at is null) desc,created_at desc,id desc) c
 left join public.organizations o on o.id=c.org_id where c.revoked_at is null or c.provider_revoked_at is null),'[]'::jsonb);
end $$;
