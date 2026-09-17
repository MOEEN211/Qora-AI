create table private.billing_observations (
 id bigint generated always as identity primary key,
 account_id uuid not null references private.billing_accounts(id), mode text not null,
 observed_at timestamptz not null default clock_timestamp(), checked_at timestamptz not null default clock_timestamp(),
 effective_at timestamptz, state jsonb not null, gap_before boolean not null default false
);
create index billing_observation_account on private.billing_observations(account_id,observed_at desc,id desc);
alter table private.billing_observations enable row level security;
revoke all on private.billing_observations from public,anon,authenticated,service_role;
create function private.billing_reporting_state(snapshot jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('status',snapshot->>'status','currency',snapshot->>'currency','reporting',coalesce(snapshot->'reporting','{"known":false}'::jsonb));
$$;
create function private.operator_billing_baseline() returns void language plpgsql security definer set search_path='' as $$
begin
 insert into private.billing_observations(account_id,mode,state,checked_at,gap_before)
 select a.id,a.mode,private.billing_reporting_state(s.snapshot),coalesce(a.synced_at,now()),a.synced_at is null or a.synced_at<now()-interval '15 minutes'
 from private.billing_accounts a left join private.billing_subscriptions s on s.account_id=a.id;
end $$;
create function private.observe_billing() returns trigger language plpgsql security definer set search_path='' as $$
declare previous private.billing_observations; current_state jsonb; account_mode text;
begin
 perform pg_advisory_xact_lock(184703,20);
 if not exists(select 1 from private.reporting_state) then return new;end if;
 current_state:=private.billing_reporting_state(new.snapshot);
 select mode into account_mode from private.billing_accounts where id=new.account_id;
 select * into previous from private.billing_observations where account_id=new.account_id order by observed_at desc,id desc limit 1;
 if previous.id is not null and previous.state=current_state and previous.checked_at>=now()-interval '15 minutes' then
 update private.billing_observations set checked_at=clock_timestamp() where id=previous.id;
 else
 insert into private.billing_observations(account_id,mode,state,gap_before,effective_at)
 values(new.account_id,account_mode,current_state,previous.id is not null and previous.checked_at<now()-interval '15 minutes',
 case when new.snapshot->>'ended_at' is not null then to_timestamp((new.snapshot->>'ended_at')::bigint) end);
 end if;return new;
end $$;
create trigger billing_reporting_observation after insert or update on private.billing_subscriptions for each row execute function private.observe_billing();

create view private.operator_subscription_rows as
select a.id,coalesce(s.updated_at,a.attempted_at,'epoch'::timestamptz) as created_at,
 lower(coalesce(o.name,'Deleted workspace')||' '||coalesce(o.slug,'')||' '||coalesce(a.customer_id,'')||' '||coalesce(s.snapshot->>'id','')) as search_text,
 coalesce(s.snapshot->>'status','unknown') as status,coalesce(s.snapshot->>'plan','') as category,a.org_id as workspace_id,0::numeric as score,a.mode,
 jsonb_build_object('id',a.id,'workspace',coalesce(o.name,'Deleted workspace'),'workspace_id',a.org_id,'identifier',o.slug,
 'customer_id',a.customer_id,'stripe_account',a.stripe_account,'subscription_id',s.snapshot->>'id','mode',a.mode,
 'plan',coalesce(s.snapshot->>'name','No plan'),'status',coalesce(s.snapshot->>'status','unknown'),'paid_access',coalesce((s.snapshot->>'paid')::boolean,false),
 'interval',s.snapshot->>'interval','amount',s.snapshot->'amount','currency',s.snapshot->>'currency',
 'period_end',s.snapshot->'period_end','cancel_at_period_end',s.snapshot->'cancel_at_period_end','synced_at',a.synced_at,
 'reporting',s.snapshot->'reporting') as data
from private.billing_accounts a left join private.billing_subscriptions s on s.account_id=a.id left join public.organizations o on o.id=a.org_id;
revoke all on private.operator_subscription_rows from public,anon,authenticated,service_role;

create function private.operator_billing_overview(target_mode text,since timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare latest jsonb; history jsonb; starting bigint; lost bigint; incomplete bigint; coverage timestamptz; bad_history boolean;
begin
 select started_at into coverage from private.reporting_state;
 select jsonb_build_object('currencies',coalesce((select jsonb_agg(to_jsonb(t)) from(
 select snapshot->>'currency' as currency,sum(coalesce((snapshot->'reporting'->>'mrr_minor')::numeric,0)) as mrr_minor
 from private.billing_subscriptions s join private.billing_accounts a on a.id=s.account_id where a.mode=target_mode and (snapshot->'reporting'->>'known')::boolean is true group by snapshot->>'currency')t),'[]'::jsonb),
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
 bool_and(coalesce((states.state->'reporting'->>'known')::boolean,false) and not states.gap_before) as complete
 from(select generate_series(greatest(since,date_trunc('day',coverage)),now(),interval '1 day')::date as day)d
 cross join lateral(select distinct on(account_id) state,gap_before from private.billing_observations where mode=target_mode and observed_at<least((d.day+1)::timestamp at time zone 'UTC',now()) order by account_id,observed_at desc,id desc)states
 group by d.day,states.state->>'currency')t;
 return jsonb_build_object('billing',latest||jsonb_build_object('mode',target_mode,'series',history),
 'churn',jsonb_build_object('starting',starting,'lost',lost,'rate',case when coverage<=since and starting>0 and incomplete=0 and not bad_history and (latest->>'incomplete')::integer=0 then round(lost*100.0/starting,2) end,
 'reason',case when coverage is null or coverage>since or incomplete>0 or bad_history or (latest->>'incomplete')::integer>0 then 'Insufficient history' when starting=0 then 'Not applicable' end));
end $$;
revoke all on function private.billing_reporting_state(jsonb),private.operator_billing_baseline(),private.observe_billing(),private.operator_billing_overview(text,timestamptz) from public,anon,authenticated,service_role;
