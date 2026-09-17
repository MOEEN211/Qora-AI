-- Known empty subscriptions do not invent a currency. Historical points need observed coverage.
create or replace function private.operator_billing_overview(target_mode text,since timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare latest jsonb; history jsonb; starting bigint; lost bigint; incomplete bigint; coverage timestamptz; bad_history boolean;
begin
 select started_at into coverage from private.reporting_state;
 select jsonb_build_object('currencies',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select snapshot->>'currency' as currency,sum(coalesce((snapshot->'reporting'->>'mrr_minor')::numeric,0)) as mrr_minor
 from private.billing_subscriptions s join private.billing_accounts a on a.id=s.account_id where a.mode=target_mode and (snapshot->'reporting'->>'known')::boolean is true and snapshot->>'currency' is not null group by snapshot->>'currency')t),'[]'::jsonb),
 'incomplete',(select count(*) from private.billing_accounts a left join private.billing_subscriptions s on s.account_id=a.id
 where a.mode=target_mode and (a.synced_at is null or a.synced_at<now()-interval '15 minutes' or coalesce((snapshot->'reporting'->>'known')::boolean,false)=false))) into latest;
 with base as(select distinct on(account_id) account_id,state from private.billing_observations where mode=target_mode and observed_at<=since order by account_id,observed_at desc,id desc),
 final as(select distinct on(account_id) account_id,state from private.billing_observations where mode=target_mode order by account_id,observed_at desc,id desc)
 select count(*) filter(where (b.state->'reporting'->>'subscriber')::boolean),
 count(*) filter(where (b.state->'reporting'->>'subscriber')::boolean and (f.state->'reporting'->>'churned')::boolean),
 count(*) filter(where coalesce((b.state->'reporting'->>'known')::boolean,false)=false or coalesce((f.state->'reporting'->>'known')::boolean,false)=false)
 into starting,lost,incomplete from base b join final f using(account_id);
 select exists(select 1 from private.billing_observations where mode=target_mode and observed_at>=since and gap_before) into bad_history;
 select coalesce(jsonb_agg(to_jsonb(t) order by day,currency),'[]'::jsonb) into history from(
 select d.day,states.state->>'currency' as currency,sum(coalesce((states.state->'reporting'->>'mrr_minor')::numeric,0)) as mrr_minor,
 bool_and(coalesce((states.state->'reporting'->>'known')::boolean,false) and states.checked_at >= least((d.day+1)::timestamp at time zone 'UTC',now())-interval '15 minutes') as complete
 from(select generate_series(greatest(since,date_trunc('day',coverage)),now(),interval '1 day')::date as day)d
 cross join lateral(select distinct on(account_id) state,checked_at from private.billing_observations where mode=target_mode and observed_at<least((d.day+1)::timestamp at time zone 'UTC',now()) order by account_id,observed_at desc,id desc)states
 where states.state->>'currency' is not null or coalesce((states.state->'reporting'->>'known')::boolean,false)=false
 group by d.day,states.state->>'currency')t;
 return jsonb_build_object('billing',latest||jsonb_build_object('mode',target_mode,'series',history),
 'churn',jsonb_build_object('starting',starting,'lost',lost,'rate',case when coverage<=since and starting>0 and incomplete=0 and not bad_history and (latest->>'incomplete')::integer=0 then round(lost*100.0/starting,2) end,
 'reason',case when coverage is null or coverage>since or incomplete>0 or bad_history or (latest->>'incomplete')::integer>0 then 'Insufficient history' when starting=0 then 'Not applicable' end));
end $$;
