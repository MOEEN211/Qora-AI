begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.admin',gen_random_uuid()::text,true),
  set_config('test.member',gen_random_uuid()::text,true),set_config('test.existing',gen_random_uuid()::text,true),
  set_config('test.newadmin',gen_random_uuid()::text,true),set_config('test.newmember',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('test.'||label)::uuid,label||'-'||current_setting('test.'||label)||'@example.invalid',now(),jsonb_build_object('full_name','Role check '||label)
from unnest(array['owner','admin','member','existing']) label;
select set_config('test.org',(select org_id::text from public.organization_members where user_id=current_setting('test.owner')::uuid),true);
select set_config('test.other',(select org_id::text from public.organization_members where user_id=current_setting('test.existing')::uuid),true);
insert into public.organization_members(org_id,user_id,role) values
  (current_setting('test.org')::uuid,current_setting('test.admin')::uuid,'admin'),
  (current_setting('test.org')::uuid,current_setting('test.member')::uuid,'member');
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'Unauthorized invitation operation succeeded';
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare invite jsonb; begin
  invite:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'existing-'||current_setting('test.existing')||'@example.invalid','admin');
  if invite->>'role'<>'admin' then raise exception 'Owner Admin offer lost';end if;
  perform set_config('test.oldtoken',invite->>'token',true);
  perform set_config('test.invite',invite->>'id',true);
  invite:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'newmember-'||current_setting('test.newmember')||'@example.invalid','member');
  perform set_config('test.membertoken',invite->>'token',true);
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''owner-offer@example.invalid'',''owner'')',current_setting('test.org')));
end $$;
reset role;
-- Resend rotates the token and preserves the original offer despite stale role input.
update private.workspace_invitations set sent_at=now()-interval '2 minutes' where id=current_setting('test.invite')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare invite jsonb; begin
  invite:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'existing-'||current_setting('test.existing')||'@example.invalid','member',current_setting('test.invite')::uuid);
  if invite->>'role'<>'admin' or invite->>'token'=current_setting('test.oldtoken') then raise exception 'Resend changed role or kept token';end if;
  if public.preview_workspace_invitation(current_setting('test.oldtoken')) is not null then raise exception 'Old link remains valid';end if;
  if public.preview_workspace_invitation(invite->>'token')->>'role'<>'admin' then raise exception 'Preview lost Admin role';end if;
  perform set_config('test.token',invite->>'token',true);
  invite:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'newadmin-'||current_setting('test.newadmin')||'@example.invalid','admin');
  if invite->>'role'<>'admin' then raise exception 'Admin cannot invite Admin';end if;
  perform set_config('test.admintoken',invite->>'token',true);
  invite:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'admin-member@example.invalid','member');
  if invite->>'role'<>'member' then raise exception 'Admin cannot invite Member';end if;
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''owner-offer@example.invalid'',''owner'')',current_setting('test.org')));
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''cross-tenant@example.invalid'',''admin'')',current_setting('test.other')));
  perform pg_temp.denied(format('select public.transfer_workspace_ownership(%L::uuid,%L::uuid)',current_setting('test.org'),current_setting('test.member')));
  perform pg_temp.denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,''admin'')',current_setting('test.org'),current_setting('test.owner')));
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''member-admin@example.invalid'',''admin'')',current_setting('test.org')));
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''member-member@example.invalid'',''member'')',current_setting('test.org')));
  perform pg_temp.denied(format('select public.accept_workspace_invitation(%L)',current_setting('test.token')));
end $$;
reset role;
-- Existing-account acceptance retains other workspaces and is idempotent.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.existing'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  perform public.accept_workspace_invitation(current_setting('test.token'));
  perform public.accept_workspace_invitation(current_setting('test.token'));
  if (select count(*) from public.organization_members where user_id=auth.uid())<>2 or
    not exists(select 1 from public.organization_members where org_id=current_setting('test.org')::uuid and user_id=auth.uid() and role='admin') then raise exception 'Existing Admin acceptance failed';end if;
end $$;
reset role;
-- Signup trusts only the stored offer, even when metadata claims Owner/another workspace.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  (current_setting('test.newadmin')::uuid,'newadmin-'||current_setting('test.newadmin')||'@example.invalid',null,
   jsonb_build_object('workspace_invitation',current_setting('test.admintoken'),'role','owner','org_id',current_setting('test.other'))),
  (current_setting('test.newmember')::uuid,'newmember-'||current_setting('test.newmember')||'@example.invalid',now(),
   jsonb_build_object('workspace_invitation',current_setting('test.membertoken'),'role','admin','org_id',current_setting('test.other')));
do $$ begin
  if (select count(*) from public.notifications where user_id in (current_setting('test.newadmin')::uuid,current_setting('test.newmember')::uuid) and kind='welcome')<>2 then raise exception 'Invited signup notification missing';end if;
  if (select count(*) from public.organization_members where user_id in (current_setting('test.newadmin')::uuid,current_setting('test.newmember')::uuid))<>2 or
     not exists(select 1 from public.organization_members where user_id=current_setting('test.newadmin')::uuid and org_id=current_setting('test.org')::uuid and role='admin') or
     not exists(select 1 from public.organization_members where user_id=current_setting('test.newmember')::uuid and org_id=current_setting('test.org')::uuid and role='member') then raise exception 'Signup did not use stored invitation role';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.newadmin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.organizations) then raise exception 'Unverified Admin has access';end if;
  perform pg_temp.denied(format('select public.issue_workspace_invitation(%L::uuid,''unverified@example.invalid'',''admin'')',current_setting('test.org')));
  perform pg_temp.denied(format('select public.accept_workspace_invitation(%L)',current_setting('test.admintoken')));
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.newadmin')::uuid;
set local role authenticated;
do $$ begin
  if public.accept_workspace_invitation(current_setting('test.admintoken'))<>current_setting('test.org')::uuid then raise exception 'Verified Admin cannot resume';end if;
  perform public.issue_workspace_invitation(current_setting('test.org')::uuid,'confirmed-admin@example.invalid','admin');
  perform pg_temp.denied(format('select public.transfer_workspace_ownership(%L::uuid,%L::uuid)',current_setting('test.org'),current_setting('test.member')));
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.issue_workspace_invitation(uuid,text,text,uuid)','execute') then raise exception 'Anonymous invitation execution';end if;
  if (select count(*) from public.organization_members where org_id=current_setting('test.org')::uuid and role='owner')<>1 then raise exception 'Ownership invariant broken';end if;
end $$;
set constraints all immediate;
rollback;
