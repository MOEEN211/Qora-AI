-- This optional adapter has no reverse dependency from core admin/billing.
create function private.operator_ai_usage(options jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; items jsonb; since timestamptz:=(options->>'since')::timestamptz;
 target uuid:=(options->>'workspace')::uuid; query text:=lower(left(coalesce(options->>'q',''),120)); page integer:=coalesce((options->>'page')::integer,0);
begin
 perform private.require_operator();
 select jsonb_build_object('requests',count(*),'completed',count(*) filter(where status='completed'),'credits',coalesce(sum(credits_charged),0),
 'input_tokens',sum(input_tokens),'output_tokens',sum(output_tokens),'cost_usd',sum(cost_usd),'missing_cost',count(*) filter(where cost_usd is null),
 'missing_tokens',count(*) filter(where input_tokens is null or output_tokens is null)) into result
 from private.ai_generations g join public.organizations o on o.id=g.org_id where g.created_at>=since and (target is null or g.org_id=target) and (query='' or strpos(lower(o.name||' '||o.slug),query)>0);
 select coalesce(jsonb_agg(to_jsonb(t) order by requests desc,id),'[]'::jsonb) into items from(
 select o.id,o.name as workspace,o.slug as identifier,a.allowance,a.consumed,a.reserved,a.allowance-a.consumed-a.reserved as available,
 count(g.id) as requests,count(g.id) filter(where g.status='completed') as completed,count(g.id) filter(where g.status='failed') as failed,
 count(g.id) filter(where g.status='stopped') as stopped,count(g.id) filter(where g.status='expired') as expired,
 coalesce(sum(g.credits_charged),0) as credits,sum(g.input_tokens) as input_tokens,sum(g.output_tokens) as output_tokens,sum(g.cost_usd) as cost_usd,
 count(g.id) filter(where g.cost_usd is null) as missing_cost
 from private.ai_credit_accounts a join public.organizations o on o.id=a.org_id left join private.ai_generations g on g.org_id=o.id and g.created_at>=since
 where (target is null or o.id=target) and (query='' or strpos(lower(o.name||' '||o.slug),query)>0)
 group by o.id,a.id order by requests desc,o.id limit 26 offset page*25)t;
 return jsonb_build_object('enabled',true,'summary',result,'rows',case when jsonb_array_length(items)>25 then items-25 else items end,'has_more',jsonb_array_length(items)>25,'page',page);
end $$;
revoke all on function private.operator_ai_usage(jsonb) from public,anon,authenticated,service_role;
