begin;
select set_config('test.pref_owner',gen_random_uuid()::text,true),set_config('test.pref_other',gen_random_uuid()::text,true),set_config('test.pref_unverified',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('test.pref_'||label)::uuid,'prefs-'||current_setting('test.pref_'||label)||'@example.invalid',
  case when label='unverified' then null else now() end,
  '{"email_enabled":false,"in_app_enabled":false}'::jsonb from unnest(array['owner','other','unverified']) label;
create function pg_temp.pref_denied(statement text) returns void language plpgsql as $$ begin
  begin execute statement; exception when insufficient_privilege then return; end;
  raise exception 'Unexpected notification preference privilege'; end $$;
do $$ begin
  if (select count(*) from public.notification_preferences where user_id in(current_setting('test.pref_owner')::uuid,current_setting('test.pref_other')::uuid,current_setting('test.pref_unverified')::uuid) and email_enabled and in_app_enabled)<>3 then raise exception 'Defaults missing or untrusted metadata used'; end if;
  if (select count(*) from public.notifications where user_id in(current_setting('test.pref_owner')::uuid,current_setting('test.pref_other')::uuid,current_setting('test.pref_unverified')::uuid) and kind='welcome')<>3 then raise exception 'Welcome signup integration failed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.pref_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; begin
  if (select count(*) from public.notification_preferences)<>1 then raise exception 'Preference read isolation'; end if;
  update public.notification_preferences set email_enabled=false,in_app_enabled=false where user_id=auth.uid();
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Own preference save';end if;
  update public.notification_preferences set email_enabled=false where user_id=current_setting('test.pref_other')::uuid;
  get diagnostics affected=row_count;if affected<>0 then raise exception 'Cross-account update';end if;
  perform pg_temp.pref_denied('update public.notification_preferences set user_id=gen_random_uuid()');
  perform pg_temp.pref_denied('delete from public.notification_preferences');
  perform pg_temp.pref_denied('insert into public.notification_preferences(user_id) values(gen_random_uuid())');
  perform pg_temp.pref_denied($q$select public.email_notifications_allowed('x@example.invalid',null)$q$);
end $$;
reset role;
do $$ declare address text; begin
  select email into address from auth.users where id=current_setting('test.pref_owner')::uuid;
  if public.email_notifications_allowed(upper(address),null) then raise exception 'Email opt-out ignored';end if;
  if public.email_notifications_allowed(address,current_setting('test.pref_owner')::uuid) then raise exception 'Welcome opt-out ignored';end if;
  if public.email_notifications_allowed(address,gen_random_uuid()) then raise exception 'Deleted known recipient allowed';end if;
  if not public.email_notifications_allowed('brand-new-'||gen_random_uuid()||'@example.invalid',null) then raise exception 'Unknown invitation blocked';end if;
  insert into public.notifications(user_id,kind,title,body) values(current_setting('test.pref_owner')::uuid,'message','Suppressed','Should not be inserted');
  if exists(select 1 from public.notifications where user_id=current_setting('test.pref_owner')::uuid and kind='message') then raise exception 'Server insertion bypassed preference';end if;
  if (select count(*) from public.notifications where user_id=current_setting('test.pref_owner')::uuid)<>1 then raise exception 'Opt-out removed existing notifications';end if;
  update public.notification_preferences set in_app_enabled=true where user_id=current_setting('test.pref_owner')::uuid;
  insert into public.notifications(user_id,kind,title,body) values(current_setting('test.pref_owner')::uuid,'message','Enabled','Allowed');
  if (select count(*) from public.notifications where user_id=current_setting('test.pref_owner')::uuid)<>2 then raise exception 'Opt-in insertion failed';end if;
  if public.email_notifications_allowed(address,null) then raise exception 'One-channel update changed another';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.pref_unverified'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer;begin
  if exists(select 1 from public.notification_preferences) then raise exception 'Unverified preference access';end if;
  update public.notification_preferences set email_enabled=false;
  get diagnostics affected=row_count;if affected<>0 then raise exception 'Unverified preference write';end if;
end $$;
reset role;
set local role anon;
select pg_temp.pref_denied('select * from public.notification_preferences');
select pg_temp.pref_denied($q$select public.email_notifications_allowed('x@example.invalid',null)$q$);
reset role;
delete from auth.users where id=current_setting('test.pref_owner')::uuid;
do $$ begin
  if exists(select 1 from public.notification_preferences where user_id=current_setting('test.pref_owner')::uuid) or exists(select 1 from public.notifications where user_id=current_setting('test.pref_owner')::uuid) then raise exception 'Account cleanup failed';end if;
end $$;
set constraints all immediate;
rollback;
