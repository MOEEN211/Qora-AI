begin;
select set_config('test.ai_user',gen_random_uuid()::text,true);
select set_config('test.ai_other',gen_random_uuid()::text,true);
select set_config('test.ai_chat',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values
  (current_setting('test.ai_user')::uuid,'ai-'||current_setting('test.ai_user')||'@example.invalid',now(),'{}','authenticated','authenticated'),
  (current_setting('test.ai_other')::uuid,'ai-'||current_setting('test.ai_other')||'@example.invalid',now(),'{}','authenticated','authenticated');
select set_config('test.ai_org',(select org_id::text from public.organization_members where user_id=current_setting('test.ai_user')::uuid limit 1),true);
select set_config('test.ai_other_org',(select org_id::text from public.organization_members where user_id=current_setting('test.ai_other')::uuid limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.ai_user'),'role','authenticated')::text,true);
set local role authenticated;
-- Explicit creation retries grant once. Adding a teammate never refills a grant.
do $$ declare id uuid; again uuid; request uuid:=gen_random_uuid(); begin
  id:=public.create_workspace('One-time grant fixture',request);
  again:=public.create_workspace('One-time grant fixture',request);
  if id<>again then raise exception 'Creation retry duplicated workspace'; end if;
  perform set_config('test.ai_created',id::text,true);
  if (public.ai_history(id,'credits','{}')->>'available')::integer<>100 then raise exception 'Explicit workspace grant missing'; end if;
end $$;
reset role;
update private.ai_credit_accounts set consumed=7 where org_id=current_setting('test.ai_created')::uuid;
insert into public.organization_members(org_id,user_id,role) values(current_setting('test.ai_created')::uuid,current_setting('test.ai_other')::uuid,'member');
do $$ begin
  if (select allowance-consumed-reserved from private.ai_credit_accounts where org_id=current_setting('test.ai_created')::uuid)<>93 then raise exception 'Membership reset credits'; end if;
end $$;
set local role authenticated;
select public.ai_history(current_setting('test.ai_org')::uuid,'create',jsonb_build_object('id',current_setting('test.ai_chat')));
do $$ declare balance jsonb; begin
  balance:=public.ai_history(current_setting('test.ai_org')::uuid,'credits','{"mode":"test"}');
  if (balance->>'available')::integer<>100 then raise exception 'Initial credits incorrect'; end if;
  begin
    perform public.ai_history(current_setting('test.ai_other_org')::uuid,'chats','{}');
    raise exception 'Cross tenant history exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ai_run('settle','{}');
    raise exception 'Members can forge settlement';
  exception when insufficient_privilege then null; end;
  begin
    update private.ai_credit_accounts set allowance=100000;
    raise exception 'Members can grant themselves credits';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare org uuid:=current_setting('test.ai_org')::uuid; actor uuid:=current_setting('test.ai_user')::uuid; chat uuid:=current_setting('test.ai_chat')::uuid;
  one uuid:=gen_random_uuid(); two uuid:=gen_random_uuid(); three uuid:=gen_random_uuid(); claim jsonb; params jsonb; result jsonb; balance jsonb;
begin
  params:=jsonb_build_object('id',one,'org_id',org,'user_id',actor,'chat_id',chat,'prompt','First request','model','fixture','mode','test');
  claim:=private.ai_run('reserve',params);
  if (private.ai_run('reserve',params)->>'duplicate')::boolean is distinct from true then raise exception 'Retry not deduplicated'; end if;
  begin
    perform private.ai_run('reserve',params||jsonb_build_object('id',two));
    raise exception 'Concurrent same chat allowed';
  exception when raise_exception then if sqlerrm='Concurrent same chat allowed' then raise; end if; end;
  perform private.ai_run('settle',jsonb_build_object('id',one,'lease',claim->>'lease','status','completed','output','Saved answer','input_tokens',10,'output_tokens',5,'cost_usd',0.001));
  perform private.ai_run('settle',jsonb_build_object('id',one,'lease',claim->>'lease','status','completed','output','Saved answer'));
  if (select consumed from private.ai_credit_accounts where org_id=org)<>1 then raise exception 'Duplicate settlement charged twice'; end if;
  claim:=private.ai_run('reserve',params||jsonb_build_object('id',two,'prompt','Fail request'));
  perform private.ai_run('checkpoint',jsonb_build_object('id',two,'lease',claim->>'lease','output','Partial'));
  perform private.ai_run('settle',jsonb_build_object('id',two,'lease',claim->>'lease','status','failed'));
  if (select reserved from private.ai_credit_accounts where org_id=org)<>0 then raise exception 'Failure leaked reservation'; end if;
  if (select output from private.ai_generations where id=two)<>'Partial' then raise exception 'Failure lost checkpoint'; end if;
  claim:=private.ai_run('reserve',params||jsonb_build_object('id',three,'prompt','Abandoned request'));
  update private.ai_generations set expires_at=now()-interval '1 second' where id=three;
  perform private.ai_recover(org);
  result:=private.ai_run('settle',jsonb_build_object('id',three,'lease',claim->>'lease','status','completed','output','Late answer'));
  if result->>'status'<>'expired' or (select consumed from private.ai_credit_accounts where org_id=org)<>1 then raise exception 'Late settlement charged released credits'; end if;
  -- Reading in another billing mode cannot create or replenish a balance.
  balance:=private.ai_history(org,'credits','{"mode":"live"}');
  if (balance->>'available')::integer<>99 or (select count(*) from private.ai_credit_accounts where org_id=org)<>1 then raise exception 'Balance was renewed'; end if;
  -- Replayed installation backfill is idempotent and preserves spend.
  insert into private.ai_credit_accounts(org_id) select id from public.organizations on conflict(org_id) do nothing;
  if (select consumed from private.ai_credit_accounts where org_id=org)<>1 then raise exception 'Backfill reset spend'; end if;
  if (select allowance-consumed-reserved from private.ai_credit_accounts where org_id=current_setting('test.ai_other_org')::uuid)<>100 then raise exception 'Other workspace does not have its own grant'; end if;
  update private.ai_credit_accounts set consumed=allowance where org_id=org;
  begin
    perform private.ai_run('reserve',params||jsonb_build_object('id',gen_random_uuid()));
    raise exception 'Zero balance permitted generation';
  exception when raise_exception then if sqlerrm<>'No AI credits available for this workspace' then raise; end if; end;
  balance:=private.ai_history(org,'credits','{"mode":"test"}');
  if (balance->>'available')::integer<>0 then raise exception 'Read refilled empty balance'; end if;
  -- Restore only this disposable transaction fixture for Stop checks.
  update private.ai_credit_accounts set consumed=1 where org_id=org;
end $$;
set local role authenticated;
do $$ declare rows jsonb; begin
  rows:=public.ai_history(current_setting('test.ai_org')::uuid,'messages',jsonb_build_object('chat_id',current_setting('test.ai_chat')));
  if jsonb_array_length(rows)<>3 or rows->0 ? 'lease' then raise exception 'History shape or lease exposure'; end if;
end $$;
reset role;
-- Explicit Stop refunds immediately and cannot be overwritten by a late completion.
do $$ declare claim jsonb; id uuid:=gen_random_uuid(); begin
  claim:=private.ai_run('reserve',jsonb_build_object('id',id,'org_id',current_setting('test.ai_org'),'user_id',current_setting('test.ai_user'),'chat_id',current_setting('test.ai_chat'),'prompt','Stop fixture','model','fixture','mode','test'));
  perform set_config('test.ai_stop',id::text,true);
  perform set_config('test.ai_stop_lease',claim->>'lease',true);
end $$;
set local role authenticated;
select public.ai_history(current_setting('test.ai_org')::uuid,'stop',jsonb_build_object('id',current_setting('test.ai_stop')));
reset role;
do $$ declare state jsonb; p uuid; rows jsonb; older jsonb; boundary jsonb; begin
  state:=private.ai_run('settle',jsonb_build_object('id',current_setting('test.ai_stop'),'lease',current_setting('test.ai_stop_lease'),'status','completed','output','Late after Stop','input_tokens',5,'output_tokens',3,'cost_usd',0.001));
  if state->>'status'<>'stopped' or (select credits_charged from private.ai_generations where id=current_setting('test.ai_stop')::uuid)<>0 then raise exception 'Stop was charged'; end if;
  if (select cost_usd from private.ai_generations where id=current_setting('test.ai_stop')::uuid)<>0.001 then raise exception 'Late provider cost lost'; end if;
  select credit_account_id into p from private.ai_generations where id=current_setting('test.ai_stop')::uuid;
  insert into private.ai_generations(id,chat_id,org_id,user_id,credit_account_id,prompt,status,model)
  select gen_random_uuid(),current_setting('test.ai_chat')::uuid,current_setting('test.ai_org')::uuid,current_setting('test.ai_user')::uuid,p,'Pagination '||n,'failed','fixture' from generate_series(1,24) n;
  rows:=private.ai_history(current_setting('test.ai_org')::uuid,'messages',jsonb_build_object('chat_id',current_setting('test.ai_chat')));
  if jsonb_array_length(rows)<>21 then raise exception 'Pagination sentinel missing'; end if;
  boundary:=rows->19;
  older:=private.ai_history(current_setting('test.ai_org')::uuid,'messages',jsonb_build_object('chat_id',current_setting('test.ai_chat'),'before',boundary->>'created_at','before_id',boundary->>'id'));
  if jsonb_array_length(older)<>8 then raise exception 'Pagination skipped rows'; end if;
  if exists(select 1 from jsonb_array_elements(rows) with ordinality r(value,n) join jsonb_array_elements(older) o on r.value->>'id'=o->>'id' where r.n<=20) then raise exception 'Pagination duplicated rows'; end if;
end $$;
rollback;
