-- Small, normalized images live with the workspace so deletion is atomic.
create table public.workspace_logos (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  image_data bytea not null check (octet_length(image_data) between 12 and 131072
    and substring(image_data from 1 for 4)=decode('52494646','hex')
    and substring(image_data from 9 for 4)=decode('57454250','hex')),
  version uuid not null default gen_random_uuid()
);
alter table public.workspace_logos enable row level security;
revoke all on public.workspace_logos from public,anon,authenticated;
grant select on public.workspace_logos to authenticated;
create policy workspace_logos_read on public.workspace_logos for select to authenticated
using ((select private.is_org_member(org_id)));

create function public.set_workspace_logo(target uuid, image bytea) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.can_manage_org(target) then raise exception 'Not permitted';end if;
  if image is null then
    delete from public.workspace_logos where org_id=target;
  else
    insert into public.workspace_logos(org_id,image_data) values(target,image)
    on conflict(org_id) do update set image_data=excluded.image_data,version=gen_random_uuid();
  end if;
end;
$$;
revoke all on function public.set_workspace_logo(uuid,bytea) from public,anon,authenticated;
grant execute on function public.set_workspace_logo(uuid,bytea) to authenticated;
