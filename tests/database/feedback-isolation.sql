begin;
select set_config('test.user_a',gen_random_uuid()::text,true);
select set_config('test.user_b',gen_random_uuid()::text,true);
select set_config('test.user_c',gen_random_uuid()::text,true);
select set_config('test.feature',gen_random_uuid()::text,true);
select set_config('test.bug',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values
  (current_setting('test.user_a')::uuid,'feedback-a-'||current_setting('test.user_a')||'@example.invalid',now(),'{}','authenticated','authenticated'),
  (current_setting('test.user_b')::uuid,'feedback-b-'||current_setting('test.user_b')||'@example.invalid',now(),'{}','authenticated','authenticated'),
  (current_setting('test.user_c')::uuid,'feedback-c-'||current_setting('test.user_c')||'@example.invalid',null,'{}','authenticated','authenticated');
select set_config('test.org_a',(select org_id::text from public.organization_members where user_id=current_setting('test.user_a')::uuid),true);
select set_config('test.org_b',(select org_id::text from public.organization_members where user_id=current_setting('test.user_b')::uuid),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_a'),'role','authenticated')::text,true);
set local role authenticated;
select public.submit_feedback('feature',current_setting('test.feature')::uuid,current_setting('test.org_a')::uuid,'Feedback fixture '||current_setting('test.feature'),'Searchable shared idea details');
select public.submit_feedback('feature',current_setting('test.feature')::uuid,current_setting('test.org_a')::uuid,'Feedback fixture '||current_setting('test.feature'),'Searchable shared idea details');
select public.submit_feedback('bug',current_setting('test.bug')::uuid,current_setting('test.org_a')::uuid,'Private bug fixture','Sensitive report must never appear on the board');
select public.set_feature_vote(current_setting('test.feature')::uuid,true);
select public.set_feature_vote(current_setting('test.feature')::uuid,true);
do $$ declare board jsonb; begin
  board:=public.search_feature_requests(current_setting('test.feature'),0);
  if (board->>'total')::int<>1 or (board->'items'->0->>'votes')::int<>1 then raise exception 'Retry duplicated feature or vote'; end if;
  if board->'items'->0 ?| array['created_by','org_id','user_id'] then raise exception 'Identity exposed'; end if;
  if (public.search_feature_requests('Sensitive report must never',0)->>'total')::int<>0 then raise exception 'Bug exposed on board'; end if;
  begin
    perform public.submit_feedback('bug',gen_random_uuid(),current_setting('test.org_b')::uuid,'Wrong workspace','Should not allow cross tenant attribution');
    raise exception 'Cross tenant submission allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.bug_reports;
    raise exception 'Raw reports readable';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.feature_requests;
    raise exception 'Raw authors readable';
  exception when insufficient_privilege then null; end;
  begin
    insert into private.feature_votes(request_id,user_id) values(current_setting('test.feature')::uuid,current_setting('test.user_b')::uuid);
    raise exception 'Vote impersonation allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_feedback('bug',gen_random_uuid(),current_setting('test.org_a')::uuid,'x','short');
    raise exception 'Invalid input accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid feedback' then raise; end if; end;
  for i in 1..9 loop
    perform public.submit_feedback('bug',gen_random_uuid(),current_setting('test.org_a')::uuid,'Quota fixture','Valid report for quota enforcement');
  end loop;
  begin
    perform public.submit_feedback('bug',gen_random_uuid(),current_setting('test.org_a')::uuid,'Quota exceeded','This request must be rejected by database');
    raise exception 'Quota bypassed';
  exception when raise_exception then if sqlerrm <> 'Feedback limit reached' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare board jsonb; begin
  board:=public.search_feature_requests(current_setting('test.feature'),0);
  if (board->>'total')::int<>1 or (board->'items'->0->>'voted')::boolean then raise exception 'Shared board or personal vote incorrect'; end if;
  if (public.set_feature_vote(current_setting('test.feature')::uuid,true)->>'votes')::int<>2 then raise exception 'Second customer vote failed'; end if;
  if (public.set_feature_vote(current_setting('test.feature')::uuid,false)->>'votes')::int<>1 then raise exception 'Vote removal affected other user'; end if;
  if (public.set_feature_vote(current_setting('test.feature')::uuid,false)->>'votes')::int<>1 then raise exception 'Vote removal retry incorrect'; end if;
  begin
    perform public.submit_feedback('feature',current_setting('test.feature')::uuid,current_setting('test.org_b')::uuid,'Stolen submission','Must not overwrite someone else');
    raise exception 'Submission ownership bypassed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.feature_votes;
    raise exception 'Voter identities exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_c'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin perform public.search_feature_requests('',0); raise exception 'Unverified read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.set_feature_vote(current_setting('test.feature')::uuid,true); raise exception 'Unverified vote allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.search_feature_requests('',0); raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.users where id=current_setting('test.user_a')::uuid;
do $$ begin
  if exists(select 1 from private.feature_requests where id=current_setting('test.feature')::uuid)
    or exists(select 1 from private.feature_votes where request_id=current_setting('test.feature')::uuid)
    or exists(select 1 from private.bug_reports where created_by=current_setting('test.user_a')::uuid)
    then raise exception 'Feedback deletion cleanup failed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin perform public.search_feature_requests('',0); raise exception 'Deleted-user token allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
