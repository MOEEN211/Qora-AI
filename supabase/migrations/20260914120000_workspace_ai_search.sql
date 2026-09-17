-- Search the entire workspace history, not just the browser's loaded page.
create function private.ai_search_chats(target uuid, search_text text default '', before_at timestamptz default null, before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; term text:=btrim(coalesce(search_text,''));
begin
  if not private.is_verified_user() or not exists (
    select 1 from public.organization_members where org_id=target and user_id=auth.uid()
  ) then raise insufficient_privilege; end if;
  if length(term)>120 then raise exception 'Search must be at most 120 characters'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from (
    select id,title,created_at from private.ai_chats
    where org_id=target
      and (term='' or strpos(lower(title),lower(term))>0)
      and (created_at,id)<(coalesce(before_at,'infinity'),coalesce(before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by created_at desc,id desc limit 21
  ) c;
  return result;
end $$;
create function public.ai_search_chats(target uuid, search_text text default '', before_at timestamptz default null, before_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.ai_search_chats(target,search_text,before_at,before_id);
$$;
revoke all on function private.ai_search_chats(uuid,text,timestamptz,uuid),public.ai_search_chats(uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function private.ai_search_chats(uuid,text,timestamptz,uuid),public.ai_search_chats(uuid,text,timestamptz,uuid) to authenticated;
