-- Run only against the explicitly targeted hosted test project after kickstart.
-- No Stripe calls, charges or emails; all fixtures and catalog changes roll back.
begin;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values
 (current_setting('test.a')::uuid,'billing-a-'||current_setting('test.a')||'@example.invalid',now(),'{"full_name":"Billing A"}','authenticated','authenticated'),
 (current_setting('test.b')::uuid,'billing-b-'||current_setting('test.b')||'@example.invalid',now(),'{"full_name":"Billing B"}','authenticated','authenticated');
select set_config('test.org_a',(select org_id::text from public.organization_members where user_id=current_setting('test.a')::uuid),true);
select set_config('test.org_b',(select org_id::text from public.organization_members where user_id=current_setting('test.b')::uuid),true);
insert into private.billing_catalog(mode,stripe_account,catalog) values('test','acct_fixture','[]'),('live','acct_fixture','[]')
 on conflict(mode) do update set stripe_account=excluded.stripe_account,catalog=excluded.catalog;
insert into private.billing_accounts(org_id,mode,stripe_account,customer_id,synced_at) values
 (current_setting('test.org_a')::uuid,'test','acct_fixture','cus_a_'||current_setting('test.a'),now()),
 (current_setting('test.org_b')::uuid,'test','acct_fixture','cus_b_'||current_setting('test.b'),now()),
 (current_setting('test.org_a')::uuid,'live','acct_fixture','cus_live_'||current_setting('test.a'),now());
select set_config('test.account',(select id::text from private.billing_accounts where org_id=current_setting('test.org_a')::uuid and mode='test'),true);
insert into private.billing_subscriptions(account_id,snapshot)
 select id,case when org_id=current_setting('test.org_a')::uuid and mode='test' then jsonb_build_object('status','active','paid',true,'plan','starter','period_end',extract(epoch from now()+interval '30 days')::bigint) else '{"status":"none","paid":false}'::jsonb end from private.billing_accounts where stripe_account='acct_fixture';
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if not (public.my_billing('test',current_setting('test.org_a')::uuid)->'snapshot'->>'paid')::boolean then raise exception 'Owner cannot read billing'; end if;
  if (public.my_billing('live',current_setting('test.org_a')::uuid)->'snapshot'->>'paid')::boolean then raise exception 'Test entitlement leaked to live'; end if;
  begin perform public.my_billing('test',current_setting('test.org_b')::uuid); raise exception 'Foreign billing read succeeded';
    exception when raise_exception then if sqlerrm<>'Not permitted' then raise; end if; end;
  begin perform public.billing_admin('commit','{}'); raise exception 'Ordinary user could mutate billing'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.billing_accounts; raise exception 'Private customers exposed'; exception when insufficient_privilege then null; end;
  begin update private.billing_subscriptions set snapshot='{"paid":true}'; raise exception 'Paid status editable'; exception when insufficient_privilege then null; end;
end $$;
-- A second workspace for the same user has independent unpaid state.
select set_config('test.org_c',public.create_workspace('Second billing workspace',gen_random_uuid())::text,true);
do $$ begin
  if (public.my_billing('test',current_setting('test.org_c')::uuid)->'snapshot'->>'paid')::boolean then raise exception 'One subscription covered another workspace'; end if;
end $$;
reset role;
insert into public.organization_members(org_id,user_id,role) values(current_setting('test.org_a')::uuid,current_setting('test.b')::uuid,'member');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if not (public.workspace_subscription(current_setting('test.org_a')::uuid,'test')->>'paid')::boolean then raise exception 'Member did not share workspace entitlement'; end if;
  begin perform public.my_billing('test',current_setting('test.org_a')::uuid); raise exception 'Member read financial details';
    exception when raise_exception then if sqlerrm<>'Not permitted' then raise; end if; end;
end $$;
reset role;
set local role service_role;
do $$ declare claim jsonb; begin
  begin perform public.billing_admin('claim',jsonb_build_object('user_id',current_setting('test.b'),'org_id',current_setting('test.org_a'),'mode','test','stripe_account','acct_fixture')); raise exception 'Member initiated billing';
    exception when raise_exception then if sqlerrm<>'Not permitted' then raise; end if; end;
  claim:=public.billing_admin('claim',jsonb_build_object('user_id',current_setting('test.a'),'org_id',current_setting('test.org_a'),'mode','test','stripe_account','acct_fixture'));
  if claim is null then raise exception 'Owner claim failed'; end if;
  perform set_config('test.lease',claim->>'token',true);
  if public.billing_admin('claim',jsonb_build_object('id',current_setting('test.account'))) is not null then raise exception 'Overlapping lease granted'; end if;
  begin perform public.billing_admin('commit',jsonb_build_object('id',current_setting('test.account'),'token',gen_random_uuid(),'snapshot','{}'::jsonb)); raise exception 'Stale token committed';
    exception when raise_exception then if sqlerrm<>'Lease lost' then raise; end if; end;
  for i in 1..2 loop
    perform public.billing_admin('commit',jsonb_build_object('id',current_setting('test.account'),'token',claim->>'token','snapshot','{"status":"active","paid":true}'::jsonb,'event_id','evt_replay'));
  end loop;
  perform public.billing_admin('release',jsonb_build_object('id',current_setting('test.account'),'token',claim->>'token'));
end $$;
reset role;
do $$ begin
  if (select count(*) from private.billing_events where account_id=current_setting('test.account')::uuid and event_id='evt_replay')<>1 then raise exception 'Event recorded twice'; end if;
  begin delete from public.organizations where id=current_setting('test.org_a')::uuid; raise exception 'Active workspace deleted';
    exception when raise_exception then if sqlerrm not like 'Refresh billing%' then raise; end if; end;
end $$;
-- Removing a cache row does not lose the durable Stripe customer mapping.
delete from private.billing_subscriptions where account_id=current_setting('test.account')::uuid;
do $$ begin
  if not exists(select 1 from private.billing_accounts where id=current_setting('test.account')::uuid and customer_id is not null) then raise exception 'Durable mapping lost'; end if;
  begin delete from public.organizations where id=current_setting('test.org_a')::uuid; raise exception 'Missing-cache workspace deleted';
    exception when raise_exception then if sqlerrm not like 'Refresh billing%' then raise; end if; end;
end $$;
insert into private.billing_subscriptions(account_id,snapshot) values(current_setting('test.account')::uuid,'{"status":"canceled","paid":false}');
update private.billing_accounts set checkout_attempt=jsonb_build_object('expires_at',floor(extract(epoch from now()+interval '1 hour'))::bigint) where id=current_setting('test.account')::uuid;
do $$ begin
  begin delete from public.organizations where id=current_setting('test.org_a')::uuid; raise exception 'Pending Checkout workspace deleted';
    exception when raise_exception then if sqlerrm not like 'Refresh billing%' then raise; end if; end;
end $$;
update private.billing_accounts set checkout_attempt=null where id=current_setting('test.account')::uuid;
delete from public.organizations where id=current_setting('test.org_a')::uuid;
do $$ begin
  if not exists(select 1 from private.billing_accounts where id=current_setting('test.account')::uuid and org_id is null and customer_id is not null) then raise exception 'Financial mapping not retained'; end if;
end $$;
rollback;
