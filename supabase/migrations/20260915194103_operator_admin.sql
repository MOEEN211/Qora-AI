-- Operator access is independent of tenant roles. No customer-data mutation API.
create table private.operator_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 granted_by uuid references auth.users(id) on delete set null
);
create table private.operator_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,
 action text not null check(action in ('grant','revoke')),
 source text not null check(source in ('app','command')),
 created_at timestamptz not null default now()
);
create table private.reporting_state (
 singleton boolean primary key default true check(singleton), started_at timestamptz not null default clock_timestamp()
);
create table private.reporting_signups_daily (day date primary key, count bigint not null default 0);
create table private.workspace_activity_daily (
 org_id uuid references public.organizations(id) on delete cascade,
 day date not null, app boolean not null default false, api boolean not null default false, mcp boolean not null default false,
 last_seen_at timestamptz not null default clock_timestamp(), primary key(org_id,day)
);
create index operator_events_time on private.operator_events(created_at desc,id desc);
create index workspace_activity_day on private.workspace_activity_daily(day,org_id);
alter table private.operator_users enable row level security;
alter table private.operator_events enable row level security;
alter table private.reporting_state enable row level security;
alter table private.reporting_signups_daily enable row level security;
alter table private.workspace_activity_daily enable row level security;
revoke all on private.operator_users,private.operator_events,private.reporting_state,private.reporting_signups_daily,private.workspace_activity_daily from public,anon,authenticated,service_role;

create function private.operator_eligible() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_user() and auth.jwt()->>'client_id' is null
 and exists(select 1 from private.operator_users where user_id=auth.uid())
 and exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid()
 and s.oauth_client_id is null and (s.not_after is null or s.not_after>now()));
$$;
create function private.operator_verified() returns boolean language sql stable security definer set search_path='' as $$
 select private.operator_eligible() and auth.jwt()->>'aal'='aal2'
 and exists(select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id
 where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid() and s.aal='aal2'
 and f.user_id=s.user_id and f.factor_type='totp' and f.status='verified'
 and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='totp'));
$$;
create function private.require_operator() returns void language plpgsql stable security definer set search_path='' as $$
begin if not coalesce(private.operator_verified(),false) then raise insufficient_privilege using message='Admin access requires an active operator and authenticator verification.'; end if;end $$;
create function private.operator_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('eligible',coalesce(private.operator_eligible(),false),'verified',coalesce(private.operator_verified(),false));
$$;
create function public.operator_status() returns jsonb language sql security invoker set search_path='' as $$ select private.operator_status(); $$;

create function private.guard_last_operator() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform private.lock_workspace_lifecycle();
 if tg_table_name='users' then target:=old.id;else target:=old.user_id;end if;
 if exists(select 1 from private.operator_users where user_id=target)
 and (select count(*) from private.operator_users)<2 then
 raise exception 'Add another admin before removing the last admin or deleting this account.';
 end if;
 return old;
end $$;
create trigger aaa_operator_deletion before delete on auth.users for each row execute function private.guard_last_operator();
create trigger operator_membership_deletion before delete on private.operator_users for each row execute function private.guard_last_operator();

create function private.operator_change(target_email text,grant_access boolean,actor uuid,origin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; changed boolean:=false;
begin
 perform private.lock_workspace_lifecycle();
 if length(target_email)>254 or length(trim(target_email))<3 then raise exception 'Enter a valid account email.';end if;
 select id into target from auth.users where lower(email)=lower(trim(target_email)) and email_confirmed_at is not null;
 if target is null then raise exception 'Create and confirm this account before adding it as an admin.';end if;
 if grant_access then
 insert into private.operator_users(user_id,granted_by) values(target,actor) on conflict do nothing;
 changed:=found;
 else
 delete from private.operator_users where user_id=target;
 changed:=found;
 end if;
 if changed then insert into private.operator_events(actor_id,target_id,action,source) values(actor,target,case when grant_access then 'grant' else 'revoke' end,origin);end if;
 return jsonb_build_object('changed',changed,'user_id',target,'granted',grant_access);
end $$;
-- Management API / database owner only. Not granted to service_role or browser roles.
create function private.operator_command(target_email text,grant_access boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.operator_change(target_email,grant_access,null,'command'); $$;
create function private.manage_operator(target_email text,grant_access boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_workspace_lifecycle();
 perform private.require_operator();
 return private.operator_change(target_email,grant_access,auth.uid(),'app');
end $$;
create function public.manage_operator(target_email text,grant_access boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.manage_operator(target_email,grant_access); $$;
create function private.operator_deletion_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_user() and (not exists(select 1 from private.operator_users where user_id=auth.uid()) or (select count(*) from private.operator_users)>1);
$$;
create function public.operator_deletion_allowed() returns boolean language sql security invoker set search_path='' as $$ select private.operator_deletion_allowed(); $$;

create function private.start_reporting() returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(184703,20);
 insert into private.reporting_state(singleton) values(true) on conflict do nothing;
 -- Optional billing module captures its baseline under the same reporting lock.
 if found and to_regprocedure('private.operator_billing_baseline()') is not null then execute 'select private.operator_billing_baseline()';end if;
end $$;
create function private.record_workspace_activity(target uuid,source text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.start_reporting();
 if target is null then return;end if;
 insert into private.workspace_activity_daily(org_id,day,app,api,mcp)
 values(target,(now() at time zone 'UTC')::date,source='app',source='api',source='mcp')
 on conflict(org_id,day) do update set app=workspace_activity_daily.app or excluded.app,
 api=workspace_activity_daily.api or excluded.api,mcp=workspace_activity_daily.mcp or excluded.mcp,last_seen_at=clock_timestamp();
end $$;
create function private.report_app_activity(target uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() or auth.jwt()->>'client_id' is not null then raise insufficient_privilege;end if;
 if target is not null and not private.is_org_member(target) then raise insufficient_privilege;end if;
 perform private.record_workspace_activity(target,'app');
end $$;
create function public.report_app_activity(target uuid default null) returns void language sql security invoker set search_path='' as $$ select private.report_app_activity(target); $$;
create function private.report_integration_activity(target uuid,source text) returns void language plpgsql security definer set search_path='' as $$
begin
 if source not in ('api','mcp') then raise exception 'Invalid activity source';end if;
 perform private.record_workspace_activity(target,source);
end $$;
create function public.report_integration_activity(target uuid,source text) returns void language sql security invoker set search_path='' as $$ select private.report_integration_activity(target,source); $$;
create function private.report_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.reporting_state) then
 insert into private.reporting_signups_daily(day,count) values((new.created_at at time zone 'UTC')::date,1)
 on conflict(day) do update set count=reporting_signups_daily.count+1;
 end if;return new;
end $$;
create trigger report_account_signup after insert on auth.users for each row execute function private.report_signup();

-- Curated private projections; no caller has SELECT privileges on these views.
create view private.operator_user_rows as
select u.id,u.created_at,lower(coalesce(p.full_name,'')||' '||u.email||' '||u.id) as search_text,
 case when u.email_confirmed_at is null then 'unverified' else 'verified' end as status,
 coalesce(n.status,'in_progress') as category,null::uuid as workspace_id,0::numeric as score,
 jsonb_build_object('id',u.id,'name',p.full_name,'email',u.email,'created_at',u.created_at,
 'last_sign_in_at',u.last_sign_in_at,'verified',u.email_confirmed_at is not null,'onboarding_status',n.status,
 'workspace_count',(select count(*) from public.organization_members m where m.user_id=u.id)) as data
from auth.users u left join public.profiles p on p.id=u.id left join public.onboarding n on n.user_id=u.id;
create view private.operator_workspace_rows as
select o.id,o.created_at,lower(o.name||' '||o.slug||' '||o.id||' '||coalesce(u.email,'')) as search_text,
 ''::text as status,''::text as category,o.id as workspace_id,0::numeric as score,
 jsonb_build_object('id',o.id,'name',o.name,'identifier',o.slug,'created_at',o.created_at,'owner',u.email,'owner_id',u.id,
 'member_count',(select count(*) from public.organization_members where org_id=o.id),
 'last_activity',(select max(last_seen_at) from private.workspace_activity_daily where org_id=o.id)) as data
from public.organizations o left join public.organization_members m on m.org_id=o.id and m.role='owner' left join auth.users u on u.id=m.user_id;
create view private.operator_bug_rows as
select b.id,b.created_at,lower(b.title||' '||b.description||' '||coalesce(u.email,'')) as search_text,
 ''::text as status,''::text as category,b.org_id as workspace_id,0::numeric as score,
 jsonb_build_object('id',b.id,'title',b.title,'description',b.description,'created_at',b.created_at,'submitter',u.email,'user_id',b.created_by,'workspace',o.name,'workspace_id',b.org_id) as data
from private.bug_reports b left join auth.users u on u.id=b.created_by left join public.organizations o on o.id=b.org_id;
create view private.operator_feature_rows as
select b.id,b.created_at,lower(b.title||' '||b.description||' '||coalesce(u.email,'')) as search_text,
 ''::text as status,''::text as category,b.org_id as workspace_id,(select count(*) from private.feature_votes where request_id=b.id)::numeric as score,
 jsonb_build_object('id',b.id,'title',b.title,'description',b.description,'created_at',b.created_at,'submitter',u.email,'user_id',b.created_by,'workspace',o.name,'workspace_id',b.org_id,
 'votes',(select count(*) from private.feature_votes where request_id=b.id)) as data
from private.feature_requests b left join auth.users u on u.id=b.created_by left join public.organizations o on o.id=b.org_id;
revoke all on private.operator_user_rows,private.operator_workspace_rows,private.operator_bug_rows,private.operator_feature_rows from public,anon,authenticated,service_role;

create function private.operator_read(section text,options jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare relation text; result jsonb; extra jsonb; target uuid:=(options->>'id')::uuid;
 query text:=lower(left(coalesce(options->>'q',''),120)); filter text:=coalesce(options->>'status',''); category text:=coalesce(options->>'category','');
 mode text:=coalesce(options->>'mode','test'); days integer:=coalesce((options->>'days')::integer,30);
 page integer:=coalesce((options->>'page')::integer,0); since timestamptz; rows jsonb; start_at timestamptz;
begin
 perform private.require_operator();
 if days not in (7,30,90) or page<0 or page>400 or mode not in ('test','live') then raise exception 'Invalid report options';end if;
 since:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - (days-1)*interval '1 day';
 if section='admins' then
 return jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',p.full_name,'created_at',a.created_at,'is_me',u.id=auth.uid()) order by a.created_at,u.id)
 from private.operator_users a join auth.users u on u.id=a.user_id left join public.profiles p on p.id=u.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from(select id,action,source,actor_id,target_id,created_at from private.operator_events where created_at>now()-interval '90 days' order by created_at desc,id desc limit 50)e),'[]'::jsonb));
 elsif section='overview' then
 select started_at into start_at from private.reporting_state;
 result:=jsonb_build_object('started_at',start_at,'since',since,'signups',(select coalesce(sum(count),0) from private.reporting_signups_daily where day>=(since at time zone 'UTC')::date),
 'active_workspaces',(select count(distinct org_id) from private.workspace_activity_daily where day>=(since at time zone 'UTC')::date),
 'series',(select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'signups',coalesce(s.count,0),'active_workspaces',(select count(*) from private.workspace_activity_daily a where a.day=d.day)) order by d.day),'[]'::jsonb)
 from(select generate_series(greatest(since,date_trunc('day',start_at)),now(),interval '1 day')::date as day)d left join private.reporting_signups_daily s on s.day=d.day));
 if to_regprocedure('private.operator_billing_overview(text,timestamp with time zone)') is not null then execute 'select private.operator_billing_overview($1,$2)' into extra using mode,since;result:=result||extra;end if;
 return result;
 elsif section='usage' then
 if to_regprocedure('private.operator_ai_usage(jsonb)') is null then return jsonb_build_object('enabled',false,'rows','[]'::jsonb);end if;
 execute 'select private.operator_ai_usage($1)' into result using options||jsonb_build_object('since',since);return result;
 end if;
 relation:=case section when 'users' then 'operator_user_rows' when 'workspaces' then 'operator_workspace_rows' when 'bugs' then 'operator_bug_rows' when 'features' then 'operator_feature_rows' when 'subscriptions' then 'operator_subscription_rows' end;
 if relation is null then raise exception 'Unknown admin section';end if;
 if to_regclass('private.'||relation) is null then return jsonb_build_object('enabled',false,'rows','[]'::jsonb);end if;
 execute format('select coalesce(jsonb_agg(data order by sort_score desc,created_at desc,id desc),''[]''::jsonb) from
 (select data,created_at,id,case when $9 then score else 0 end sort_score from private.%I where
 ($1='''' or strpos(search_text,$1)>0) and ($2 is null or id=$2) and ($3='''' or status=$3)
 and ($4='''' or category=$4) and ($5 is null or workspace_id=$5)
 and ($6 is null or created_at >= $6) %s order by sort_score desc,created_at desc,id desc limit 26 offset $8*25) r',relation,
 case when section='subscriptions' then 'and mode=$7' else '' end)
 into rows using query,target,filter,category,(options->>'workspace')::uuid,
 case when section in ('bugs','features') or options->>'dated'='true' then since else null end,mode,page,options->>'sort'='votes';
 result:=jsonb_build_object('enabled',true,'rows',case when jsonb_array_length(rows)>25 then rows-25 else rows end,'has_more',jsonb_array_length(rows)>25,'page',page);
 if target is not null and jsonb_array_length(rows)>0 then
 if section='users' then
 result:=result||jsonb_build_object('onboarding',(select jsonb_build_object('display_name',n.display_name,'use_case',n.use_case,'interests',n.interests,'status',n.status) from public.onboarding n where user_id=target),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role)),'[]'::jsonb) from public.organization_members m join public.organizations o on o.id=m.org_id where m.user_id=target));
 elsif section='workspaces' then
 result:=result||jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',p.full_name,'role',m.role)),'[]'::jsonb) from public.organization_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=u.id where m.org_id=target));
 end if;end if;
 return result;
end $$;
create function public.operator_read(section text,options jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.operator_read(section,options); $$;

revoke all on function private.operator_eligible(),private.operator_verified(),private.require_operator(),private.operator_status(),public.operator_status(),
 private.guard_last_operator(),private.operator_change(text,boolean,uuid,text),private.operator_command(text,boolean),private.manage_operator(text,boolean),public.manage_operator(text,boolean),
 private.operator_deletion_allowed(),public.operator_deletion_allowed(),private.start_reporting(),private.record_workspace_activity(uuid,text),private.report_app_activity(uuid),public.report_app_activity(uuid),
 private.report_integration_activity(uuid,text),public.report_integration_activity(uuid,text),private.report_signup(),private.operator_read(text,jsonb),public.operator_read(text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function private.operator_status(),public.operator_status(),private.manage_operator(text,boolean),public.manage_operator(text,boolean),
 private.operator_deletion_allowed(),public.operator_deletion_allowed(),private.report_app_activity(uuid),public.report_app_activity(uuid),private.operator_read(text,jsonb),public.operator_read(text,jsonb) to authenticated;
grant execute on function private.report_integration_activity(uuid,text),public.report_integration_activity(uuid,text) to service_role;
-- Retention is a provider-owned maintenance job, independent of report reads.
create extension if not exists pg_cron with schema pg_catalog;
do $retention$ begin
 perform cron.schedule('forma-operator-audit-retention','19 3 * * *',$job$delete from private.operator_events where created_at<now()-interval '90 days'$job$);
end $retention$;
