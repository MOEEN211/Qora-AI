begin;
select set_config('test.recipient',gen_random_uuid()::text,true),
  set_config('test.other',gen_random_uuid()::text,true),
  set_config('test.unverified',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('test.'||label)::uuid,label||'-'||current_setting('test.'||label)||'@example.invalid',
  case when label='unverified' then null else now() end,'{}'::jsonb
from unnest(array['recipient','other','unverified']) label;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
  begin execute statement; exception when insufficient_privilege then return; end;
  raise exception 'Unexpected notification permission';
end $$;
do $$ begin
  if (select count(*) from public.notifications where user_id in (current_setting('test.recipient')::uuid,current_setting('test.other')::uuid,current_setting('test.unverified')::uuid) and kind='welcome')<>3 then raise exception 'Signup welcome missing';end if;
  perform private.welcome_notification(current_setting('test.recipient')::uuid);
  perform private.welcome_notification(current_setting('test.recipient')::uuid);
  if (select count(*) from public.notifications where user_id=current_setting('test.recipient')::uuid)<>1 then raise exception 'Duplicate welcome';end if;
end $$;
-- Sharing a workspace never shares an account inbox.
insert into public.organization_members(org_id,user_id,role)
select org_id,current_setting('test.other')::uuid,'member' from public.organization_members where user_id=current_setting('test.recipient')::uuid;
insert into public.notifications(user_id,title,body)
select current_setting('test.recipient')::uuid,'Older update '||i,'Notification pagination fixture.' from generate_series(1,25) i;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.recipient'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; begin
  if (select count(*) from public.notifications)<>26 then raise exception 'Account read isolation failed';end if;
  update public.notifications set read_at=now() where user_id=current_setting('test.other')::uuid;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Cross-account write';end if;
  perform pg_temp.denied('update public.notifications set title=''Forged''');
  perform pg_temp.denied(format('update public.notifications set user_id=%L::uuid',current_setting('test.other')));
  perform pg_temp.denied(format('insert into public.notifications(user_id,title,body) values(%L::uuid,''Forged'',''Forged'')',current_setting('test.recipient')));
  perform pg_temp.denied('delete from public.notifications');
  perform pg_temp.denied(format('select private.welcome_notification(%L::uuid)',current_setting('test.recipient')));
  update public.notifications set read_at=now() where read_at is null;
  get diagnostics affected = row_count;
  if affected<>26 then raise exception 'Mark all omitted older notifications';end if;
  update public.notifications set read_at=now() where read_at is null;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Mark all retry changed receipts';end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.notifications where user_id=current_setting('test.other')::uuid and read_at is null) then raise exception 'Other inbox modified';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.unverified'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; begin
  if exists(select 1 from public.notifications) then raise exception 'Unverified read';end if;
  update public.notifications set read_at=now(); get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Unverified write';end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.unverified')::uuid;
set local role authenticated;
do $$ begin if (select count(*) from public.notifications)<>1 then raise exception 'Verified welcome unavailable';end if; end $$;
reset role;
set local role anon;
select pg_temp.denied('select id from public.notifications');
reset role;
delete from auth.users where id=current_setting('test.unverified')::uuid;
do $$ begin if exists(select 1 from public.notifications where user_id=current_setting('test.unverified')::uuid) then raise exception 'Deletion orphaned notifications';end if; end $$;
set local role authenticated;
do $$ begin if exists(select 1 from public.notifications) then raise exception 'Stale account session reads notifications';end if;end $$;
reset role;
set constraints all immediate;
rollback;
