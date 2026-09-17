create or replace function private.operator_read(section text,options jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
 elsif section='subscription-history' then
 if to_regprocedure('private.operator_subscription_history(uuid,text)') is null then return jsonb_build_object('rows','[]'::jsonb);end if;
 execute 'select private.operator_subscription_history($1,$2)' into result using target,mode;return result;
 elsif section='usage' then
 if to_regprocedure('private.operator_ai_usage(jsonb)') is null then return jsonb_build_object('enabled',false,'rows','[]'::jsonb);end if;
 execute 'select private.operator_ai_usage($1)' into result using options||jsonb_build_object('since',since);return result;
 end if;
 relation:=case section when 'users' then 'operator_user_rows' when 'workspaces' then 'operator_workspace_rows' when 'bugs' then 'operator_bug_rows' when 'features' then 'operator_feature_rows' when 'subscriptions' then 'operator_subscription_rows' end;
 if section='workspaces' and to_regclass('private.operator_workspace_billing_rows') is not null then relation:='operator_workspace_billing_rows';end if;
 if relation is null then raise exception 'Unknown admin section';end if;
 if to_regclass('private.'||relation) is null then return jsonb_build_object('enabled',false,'rows','[]'::jsonb);end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''data'',data,''cursor'',jsonb_build_object(''at'',created_at,''id'',id,''score'',sort_score)) order by sort_score desc,created_at desc,id desc),''[]''::jsonb) from
 (select data,created_at,id,case when $9 then score else 0 end sort_score from private.%I where
 ($1='''' or strpos(search_text,$1)>0) and ($2 is null or id=$2) and ($3='''' or status=$3)
 and ($4='''' or category=$4) and ($5 is null or workspace_id=$5)
 and ($6 is null or created_at >= $6)
 and ($10='''' or data->>''interval''=$10) and ($11='''' or coalesce(data->>''cancel_at_period_end'',''false'')=$11)
 and ($12 is null or (case when $9 then score else 0 end,created_at,id)<(($12->>''score'')::numeric,($12->>''at'')::timestamptz,($12->>''id'')::uuid))
 and (not $13 or exists(select 1 from private.workspace_activity_daily a where a.org_id=workspace_id and a.day>=($14 at time zone ''UTC'')::date))
 %s order by sort_score desc,created_at desc,id desc limit 26 offset case when $12 is null then $8*25 else 0 end) r',relation,
 case when section='subscriptions' or relation='operator_workspace_billing_rows' then 'and mode=$7' else '' end)
 into rows using query,target,filter,category,(options->>'workspace')::uuid,
 case when section in ('bugs','features') or options->>'dated'='true' then since else null end,mode,page,coalesce(options->>'sort'='votes',false),
 coalesce(options->>'interval',''),coalesce(options->>'canceling',''),options->'cursor',coalesce(options->>'active'='true',false),since;
 result:=jsonb_build_object('enabled',true,'rows',(select coalesce(jsonb_agg(value->'data'),'[]'::jsonb) from jsonb_array_elements(case when jsonb_array_length(rows)>25 then rows-25 else rows end)),'has_more',jsonb_array_length(rows)>25,'page',page,'next_cursor',case when jsonb_array_length(rows)>25 then rows->24->'cursor' end);
 if target is not null and jsonb_array_length(rows)>0 then
 if section='users' then
 result:=result||jsonb_build_object('onboarding',(select jsonb_build_object('display_name',n.display_name,'use_case',n.use_case,'interests',n.interests,'status',n.status) from public.onboarding n where user_id=target),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role)),'[]'::jsonb) from public.organization_members m join public.organizations o on o.id=m.org_id where m.user_id=target));
 elsif section='workspaces' then
 result:=result||jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',p.full_name,'role',m.role)),'[]'::jsonb) from public.organization_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=u.id where m.org_id=target));
 end if;end if;
 return result;
end $$;
