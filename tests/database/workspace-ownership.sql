begin;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true),set_config('test.c',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('test.'||label)::uuid,label||'-'||current_setting('test.'||label)||'@example.invalid',now(),jsonb_build_object('full_name','Ownership '||label) from unnest(array['a','b','c']) label;
select set_config('test.org',(select org_id::text from public.organization_members where user_id=current_setting('test.a')::uuid),true);
insert into public.organization_members(org_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.b')::uuid,'member');
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
  begin execute statement;exception when others then return;end;
  raise exception 'Unexpected permission: %',statement;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare invitation jsonb; begin
  if exists(select 1 from public.organizations where slug !~ '^WRK[A-Z0-9]{10}$') then raise exception 'Identifier format wrong';end if;
  perform pg_temp.denied(format('update public.organizations set slug=''WRKAAAAAAAAAA'' where id=%L::uuid',current_setting('test.org')));
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''pending@example.invalid'',''owner'')',current_setting('test.org')));
  invitation:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'c-'||current_setting('test.c')||'@example.invalid','member');
  perform pg_temp.denied(format('select public.transfer_workspace_ownership(%L::uuid,%L::uuid)',current_setting('test.org'),current_setting('test.c')));
  perform pg_temp.denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,''admin'')',current_setting('test.org'),current_setting('test.c')));
  perform pg_temp.denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,''owner'')',current_setting('test.org'),current_setting('test.b')));
  perform pg_temp.denied(format('select public.transfer_workspace_ownership(%L::uuid,%L::uuid)',current_setting('test.org'),current_setting('test.a')));
  perform public.transfer_workspace_ownership(current_setting('test.org')::uuid,current_setting('test.b')::uuid);
  if (select role from public.organization_members where org_id=current_setting('test.org')::uuid and user_id=auth.uid())<>'admin' then raise exception 'Former owner not admin';end if;
  perform pg_temp.denied(format('select public.transfer_workspace_ownership(%L::uuid,%L::uuid)',current_setting('test.org'),current_setting('test.a')));
end $$;
reset role;
do $$ begin
  if (select count(*) from public.organization_members where org_id=current_setting('test.org')::uuid and role='owner')<>1 then raise exception 'Not exactly one owner';end if;
  perform pg_temp.denied(format('update public.organization_members set role=''owner'' where org_id=%L::uuid and user_id=%L::uuid',current_setting('test.org'),current_setting('test.a')));
  perform pg_temp.denied(format('update public.organizations set slug=''WRKBBBBBBBBBB'' where id=%L::uuid',current_setting('test.org')));
  begin
    update public.organization_members set role='admin' where org_id=current_setting('test.org')::uuid and user_id=current_setting('test.b')::uuid;
    set constraints all immediate;
    raise exception 'Ownerless workspace allowed';
  exception when raise_exception then if sqlerrm='Ownerless workspace allowed' then raise;end if;end;
end $$;
set constraints all immediate;
rollback;
