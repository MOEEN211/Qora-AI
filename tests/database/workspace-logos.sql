begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.admin',gen_random_uuid()::text,true),
 set_config('test.member',gen_random_uuid()::text,true),set_config('test.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('test.'||label)::uuid,label||'-'||current_setting('test.'||label)||'@example.invalid',now(),jsonb_build_object('full_name','Logo fixture') from unnest(array['owner','admin','member','outsider']) label;
select set_config('test.org',(select org_id::text from public.organization_members where user_id=current_setting('test.owner')::uuid),true);
insert into public.organization_members(org_id,user_id,role) values
 (current_setting('test.org')::uuid,current_setting('test.admin')::uuid,'admin'),
 (current_setting('test.org')::uuid,current_setting('test.member')::uuid,'member');
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement;exception when others then return;end;
 raise exception 'Unexpected logo permission';
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
select public.set_workspace_logo(current_setting('test.org')::uuid,decode('524946460400000057454250','hex'));
select set_config('test.version',(select version::text from public.workspace_logos where org_id=current_setting('test.org')::uuid),true);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.set_workspace_logo(current_setting('test.org')::uuid,decode('524946460400000057454250','hex'));
do $$ begin
 if (select version::text from public.workspace_logos where org_id=current_setting('test.org')::uuid)=current_setting('test.version') then raise exception 'Logo version did not change';end if;
 perform pg_temp.denied(format('select public.set_workspace_logo(%L::uuid,decode(''0000'',''hex''))',current_setting('test.org')));
 perform pg_temp.denied(format('update public.workspace_logos set version=gen_random_uuid() where org_id=%L::uuid',current_setting('test.org')));
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.workspace_logos where org_id=current_setting('test.org')::uuid) then raise exception 'Member cannot see logo';end if;
 perform pg_temp.denied(format('select public.set_workspace_logo(%L::uuid,null)',current_setting('test.org')));
 perform public.change_workspace_member(current_setting('test.org')::uuid,auth.uid(),null);
 if exists(select 1 from public.workspace_logos where org_id=current_setting('test.org')::uuid) then raise exception 'Departed member sees logo';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.outsider'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.workspace_logos where org_id=current_setting('test.org')::uuid) then raise exception 'Cross-workspace logo read';end if;
 perform pg_temp.denied(format('select public.set_workspace_logo(%L::uuid,null)',current_setting('test.org')));
end $$;
reset role;
update auth.users set email_confirmed_at=null where id=current_setting('test.admin')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.workspace_logos) then raise exception 'Unverified user sees logos';end if;
 perform pg_temp.denied(format('select public.set_workspace_logo(%L::uuid,null)',current_setting('test.org')));
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.admin')::uuid;
set local role authenticated;
select public.set_workspace_logo(current_setting('test.org')::uuid,null);
do $$ begin if exists(select 1 from public.workspace_logos) then raise exception 'Admin remove failed';end if;end $$;
select public.set_workspace_logo(current_setting('test.org')::uuid,decode('524946460400000057454250','hex'));
reset role;
delete from public.organizations where id=current_setting('test.org')::uuid;
do $$ begin
 if exists(select 1 from public.workspace_logos where org_id=current_setting('test.org')::uuid) then raise exception 'Deletion orphaned logo';end if;
 if has_table_privilege('anon','public.workspace_logos','select') or has_function_privilege('anon','public.set_workspace_logo(uuid,bytea)','execute') then raise exception 'Anonymous access granted';end if;
end $$;
set constraints all immediate;
rollback;
