begin;
select set_config('test.onboard_owner',gen_random_uuid()::text,true),
  set_config('test.onboard_other',gen_random_uuid()::text,true),
  set_config('test.onboard_unverified',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('test.onboard_'||label)::uuid,'onboarding-'||current_setting('test.onboard_'||label)||'@example.invalid',
  case when label='unverified' then null else now() end,
  '{"onboarding_status":"completed","status":"skipped"}'::jsonb
from unnest(array['owner','other','unverified']) label;
create function pg_temp.onboard_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when insufficient_privilege then return; end;
  raise exception 'Unexpected onboarding privilege';
end $$;
create function pg_temp.onboard_invalid(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when check_violation then return; end;
  raise exception 'Invalid onboarding data accepted';
end $$;
do $$ begin
  if (select count(*) from public.onboarding where user_id in
    (current_setting('test.onboard_owner')::uuid,current_setting('test.onboard_other')::uuid,current_setting('test.onboard_unverified')::uuid)
    and status='in_progress' and current_step=1) <> 3 then raise exception 'Signup bootstrap or metadata isolation failed'; end if;
end $$;
-- Even another member of the same workspace cannot read the owner's answers.
insert into public.organization_members(org_id,user_id,role)
select org_id,current_setting('test.onboard_other')::uuid,'member' from public.organization_members
where user_id=current_setting('test.onboard_owner')::uuid limit 1;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.onboard_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; terminal_time timestamptz; begin
  if (select count(*) from public.onboarding) <> 1 then raise exception 'Account read isolation failed'; end if;
  update public.onboarding set status='skipped' where user_id=current_setting('test.onboard_other')::uuid;
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Cross-account update allowed'; end if;
  perform pg_temp.onboard_denied('update public.onboarding set user_id=gen_random_uuid()');
  perform pg_temp.onboard_denied('update public.onboarding set skipped_at=now()');
  perform pg_temp.onboard_denied('delete from public.onboarding');
  perform pg_temp.onboard_denied('insert into public.onboarding(user_id) values(gen_random_uuid())');
  perform pg_temp.onboard_invalid($q$update public.onboarding set status='completed'$q$);
  perform pg_temp.onboard_invalid($q$update public.onboarding set use_case='invalid'$q$);
  perform pg_temp.onboard_invalid($q$update public.onboarding set interests=array['invalid']$q$);
  perform pg_temp.onboard_invalid($q$update public.onboarding set current_step=4$q$);
  update public.onboarding set display_name='Onboarding Tester',current_step=2;
  if not exists(select 1 from public.onboarding where display_name='Onboarding Tester' and current_step=2 and status='in_progress') then raise exception 'Draft progress not saved'; end if;
  update public.onboarding set current_step=1;
  update public.onboarding set status='skipped';
  select skipped_at into terminal_time from public.onboarding;
  if terminal_time is null then raise exception 'Skip timestamp missing'; end if;
  update public.onboarding set status='in_progress',display_name='Stale tab';
  update public.onboarding set status='completed',display_name='Stale finish',use_case='work',current_step=3;
  if not exists(select 1 from public.onboarding where status='skipped' and display_name='Onboarding Tester' and skipped_at=terminal_time and completed_at is null) then raise exception 'Skip was overwritten'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.onboard_other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  update public.onboarding set display_name='Other Tester',use_case='exploring',interests=array['dashboard','team'],current_step=3,status='completed';
  if not exists(select 1 from public.onboarding where status='completed' and completed_at is not null and skipped_at is null) then raise exception 'Completion not saved'; end if;
  update public.onboarding set status='skipped';
  update public.onboarding set status='in_progress';
  if not exists(select 1 from public.onboarding where status='completed' and interests=array['dashboard','team']) then raise exception 'Completion was overwritten'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.onboard_unverified'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; begin
  if exists(select 1 from public.onboarding) then raise exception 'Unverified read allowed'; end if;
  update public.onboarding set status='skipped';
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Unverified update allowed'; end if;
end $$;
reset role;
set local role anon;
select pg_temp.onboard_denied('select * from public.onboarding');
select pg_temp.onboard_denied($q$update public.onboarding set status='skipped'$q$);
reset role;
delete from auth.users where id=current_setting('test.onboard_other')::uuid;
do $$ begin
  if exists(select 1 from public.onboarding where user_id=current_setting('test.onboard_other')::uuid) then raise exception 'Account deletion did not cascade'; end if;
end $$;
rollback;
