-- Accounting-only fixtures, no Stripe requests. All changes roll back.
begin;
do $$
declare u uuid:=gen_random_uuid(); org uuid; a uuid; b uuid; before_report jsonb; after_report jsonb;
 since timestamptz:=now()-interval '7 days'; baseline jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at,created_at) values(u,'admin-metrics-'||u||'@example.invalid',now(),now());
 select org_id into org from public.organization_members where user_id=u limit 1;
 perform private.start_reporting();
 before_report:=private.operator_billing_overview('test',since);
 insert into private.billing_accounts(org_id,mode,stripe_account,customer_id,synced_at)
 values(org,'test','acct_metrics_fixture','cus_metrics_'||u,now()) returning id into a;
 -- A second customer already lost its workspace; billing history survives that deletion.
 insert into private.billing_accounts(org_id,mode,stripe_account,customer_id,synced_at)
 values(null,'test','acct_metrics_fixture','cus_metrics_deleted_'||u,now()) returning id into b;
 baseline:='{"status":"active","currency":"xyz","reporting":{"known":true,"subscriber":true,"churned":false,"mrr_minor":1900}}';
 insert into private.billing_observations(account_id,mode,state,observed_at,checked_at)
 values(a,'test',baseline,since-interval '1 hour',now()),(b,'test',baseline,since-interval '1 hour',now());
 insert into private.billing_subscriptions(account_id,snapshot) values
 (a,'{"status":"past_due","currency":"xyz","reporting":{"known":true,"subscriber":true,"churned":false,"mrr_minor":1900}}'),
 (b,'{"status":"canceled","currency":"xyz","reporting":{"known":true,"subscriber":false,"churned":true,"mrr_minor":0}}');
 after_report:=private.operator_billing_overview('test',since);
 if (after_report#>>'{churn,starting}')::bigint <> (before_report#>>'{churn,starting}')::bigint+2
 or (after_report#>>'{churn,lost}')::bigint <> (before_report#>>'{churn,lost}')::bigint+1 then raise exception 'Starting cohort, deleted workspace or payment-retry churn incorrect';end if;
 if not exists(select 1 from jsonb_array_elements(after_report#>'{billing,currencies}') r where r->>'currency'='xyz' and (r->>'mrr_minor')::numeric=1900) then raise exception 'MRR sum incorrect';end if;
 -- Recovery before period end removes the loss; period acquisitions never enter its starting cohort.
 update private.billing_subscriptions set snapshot=baseline where account_id=b;
 after_report:=private.operator_billing_overview('test',since);
 if (after_report#>>'{churn,lost}')::bigint <> (before_report#>>'{churn,lost}')::bigint then raise exception 'Recovered subscription counted as churn';end if;
 -- A gap before the observation must not poison every future observed day.
 update private.billing_observations set gap_before=true where account_id=a;
 after_report:=private.operator_billing_overview('test',since);
 if not exists(select 1 from jsonb_array_elements(after_report#>'{billing,series}') r where r->>'currency'='xyz' and (r->>'day')::date=(now() at time zone 'UTC')::date and (r->>'complete')::boolean) then raise exception 'Fresh MRR point incorrectly inherits an old gap';end if;
 update private.billing_accounts set synced_at=now()-interval '20 minutes' where id=a;
 after_report:=private.operator_billing_overview('test',since);
 if (after_report#>>'{billing,incomplete}')::bigint <> (before_report#>>'{billing,incomplete}')::bigint+1 then raise exception 'Stale accounting presented as complete';end if;
 if after_report#>>'{churn,rate}' is not null then raise exception 'Incomplete cohort presented as a churn rate';end if;
end $$;
rollback;
