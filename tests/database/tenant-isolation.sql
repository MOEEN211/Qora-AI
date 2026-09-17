-- All fixtures and mutations are rolled back. Run only on an explicitly chosen test project.
begin;
select set_config('test.user_a', gen_random_uuid()::text, true);
select set_config('test.user_b', gen_random_uuid()::text, true);
select set_config('test.user_c', gen_random_uuid()::text, true);
insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, aud, role)
values
  (current_setting('test.user_a')::uuid, 'a-' || current_setting('test.user_a') || '@example.invalid', now(), '{"full_name":"Test A"}', 'authenticated', 'authenticated'),
  (current_setting('test.user_b')::uuid, 'b-' || current_setting('test.user_b') || '@example.invalid', now(), '{"full_name":"Test B"}', 'authenticated', 'authenticated'),
  (current_setting('test.user_c')::uuid, 'c-' || current_setting('test.user_c') || '@example.invalid', null, '{"full_name":"Test C"}', 'authenticated', 'authenticated');
select set_config('test.org_a', (select org_id::text from public.organization_members where user_id=current_setting('test.user_a')::uuid), true);
select set_config('test.org_b', (select org_id::text from public.organization_members where user_id=current_setting('test.user_b')::uuid), true);

do $$ begin
  if (select count(*) from public.organization_members where user_id=current_setting('test.user_a')::uuid) <> 1 then raise exception 'Expected exactly one workspace for ordinary signup'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare affected int; begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'Organization read isolation failed'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Profile read isolation failed'; end if;
  if exists(select 1 from public.organization_members where user_id=current_setting('test.user_b')::uuid) then raise exception 'Membership read isolation failed'; end if;
  update public.organizations set name='forbidden' where id=current_setting('test.org_b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-tenant update succeeded'; end if;
  update public.organizations set name='Allowed rename' where id=current_setting('test.org_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner update failed'; end if;
  begin
    update public.organization_members set role='admin' where user_id=current_setting('test.user_a')::uuid;
    raise exception 'Direct role mutation was permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user_c'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.organizations) or exists(select 1 from public.profiles) or exists(select 1 from public.organization_members) then raise exception 'Unverified user gained access'; end if;
end $$;
reset role;
rollback;
