create view private.operator_workspace_billing_rows as
select w.id,w.created_at,w.search_text,coalesce(b.status,'none') as status,coalesce(b.category,'free') as category,w.workspace_id,w.score,
 w.data||jsonb_build_object('plan',coalesce(b.data->>'plan','Free'),'subscription_status',coalesce(b.status,'none')) as data,
 m.mode
from private.operator_workspace_rows w cross join (values('test'::text),('live'::text)) m(mode)
left join private.operator_subscription_rows b on b.workspace_id=w.id and b.mode=m.mode;
revoke all on private.operator_workspace_billing_rows from public,anon,authenticated,service_role;
create function private.operator_subscription_history(target uuid,target_mode text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by observed_at desc,id desc) from(
 select id,observed_at,checked_at,effective_at,state,gap_before from private.billing_observations where account_id=target and mode=target_mode order by observed_at desc,id desc limit 100)r),'[]'::jsonb));
$$;
revoke all on function private.operator_subscription_history(uuid,text) from public,anon,authenticated,service_role;
