begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.admin',gen_random_uuid()::text,true),set_config('test.member',gen_random_uuid()::text,true),set_config('test.new',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
select current_setting('test.'||label)::uuid,label||'-'||current_setting('test.'||label)||'@example.invalid',now(),jsonb_build_object('full_name','Workspace '||label),'authenticated','authenticated' from unnest(array['owner','admin','member']) label;
select set_config('test.org',(select org_id::text from public.organization_members where user_id=current_setting('test.owner')::uuid),true);
select set_config('test.other',(select org_id::text from public.organization_members where user_id=current_setting('test.admin')::uuid),true);
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then return; end;
  raise exception 'Expected denial: %',statement;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare one uuid; two uuid; request uuid:=gen_random_uuid(); invite jsonb; begin
  one:=public.create_workspace('Second workspace',request);two:=public.create_workspace('Second workspace',request);
  if one<>two then raise exception 'Creation retry duplicated workspace';end if;
  perform pg_temp.expect_denied(format('select public.workspace_team(%L::uuid)',current_setting('test.other')));
  perform pg_temp.expect_denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,null)',current_setting('test.org'),current_setting('test.owner')));
  invite:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'new-'||current_setting('test.new')||'@example.invalid','member');
  perform set_config('test.token',invite->>'token',true);perform set_config('test.invite',invite->>'id',true);
  perform pg_temp.expect_denied(format('select public.issue_workspace_invitation(%L::uuid,%L,''admin'',%L::uuid)',current_setting('test.org'),invite->>'email',invite->>'id'));
  if public.preview_workspace_invitation(invite->>'token') is null then raise exception 'Preview missing';end if;
  if (public.workspace_team(current_setting('test.org')::uuid)->'members') @> jsonb_build_array(jsonb_build_object('id',current_setting('test.new'))) then raise exception 'Preview accepted invitation';end if;
  perform pg_temp.expect_denied(format('select public.delete_workspace(%L::uuid,%L::uuid,''x'')',current_setting('test.org'),current_setting('test.owner')));
end $$;
reset role;
-- Valid invited signup has exactly one membership and no personal workspace.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values(current_setting('test.new')::uuid,'new-'||current_setting('test.new')||'@example.invalid',null,jsonb_build_object('full_name','Invited new','workspace_invitation',current_setting('test.token')),'authenticated','authenticated');
do $$ begin
  if (select count(*) from public.organization_members where user_id=current_setting('test.new')::uuid)<>1 or not exists(select 1 from public.organization_members where user_id=current_setting('test.new')::uuid and org_id=current_setting('test.org')::uuid and role='member') then raise exception 'Invited bootstrap failed';end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.new'),'role','authenticated')::text,true);
-- Even the owner cannot elevate an invited signup awaiting verification.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,''admin'')',current_setting('test.org'),current_setting('test.new')));
  perform pg_temp.expect_denied(format('select public.transfer_workspace_ownership(%L::uuid,%L::uuid)',current_setting('test.org'),current_setting('test.new')));
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.new'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.organizations) then raise exception 'Unverified access allowed';end if;
  perform pg_temp.expect_denied(format('select public.accept_workspace_invitation(%L)',current_setting('test.token')));
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.new')::uuid;
update private.workspace_invitations set expires_at=now()-interval '1 day' where accepted_by=current_setting('test.new')::uuid;
set local role authenticated;
do $$ begin
  if public.preview_workspace_invitation(current_setting('test.token')) is null then raise exception 'Confirmed signup cannot resume after invitation expiry';end if;
  if public.accept_workspace_invitation(current_setting('test.token'))<>current_setting('test.org')::uuid or public.accept_workspace_invitation(current_setting('test.token'))<>current_setting('test.org')::uuid then raise exception 'Acceptance retry failed';end if;
  perform pg_temp.expect_denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,''member'')',current_setting('test.org'),current_setting('test.owner')));
  perform pg_temp.expect_denied(format('select public.change_workspace_member(%L::uuid,%L::uuid,''owner'')',current_setting('test.org'),current_setting('test.new')));
  perform pg_temp.expect_denied('select * from private.workspace_invitations');
end $$;
reset role;
-- Add accepted teammates for role and key lifecycle checks.
insert into public.organization_members(org_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.admin')::uuid,'admin'),(current_setting('test.org')::uuid,current_setting('test.member')::uuid,'member');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare key jsonb; begin
  key:=public.create_api_key(current_setting('test.org')::uuid,'Temporary key','read',30);perform set_config('test.key',key->>'secret',true);
  perform public.issue_workspace_invitation(current_setting('test.org')::uuid,'issued-by-admin@example.invalid','member');
  perform public.change_workspace_member(current_setting('test.org')::uuid,current_setting('test.member')::uuid,'admin');
  perform public.change_workspace_member(current_setting('test.org')::uuid,current_setting('test.member')::uuid,'member');
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.workspace_team(current_setting('test.org')::uuid)->'members')<>4 then raise exception 'Team roster missing';end if;
  if public.workspace_team(current_setting('test.org')::uuid)->'invitations'<>'[]'::jsonb then raise exception 'Member sees invitations';end if;
  if (select count(*) from public.profiles)<>1 then raise exception 'Global profile access expanded';end if;
  perform pg_temp.expect_denied(format('select public.issue_workspace_invitation(%L::uuid,''x@example.invalid'',''member'')',current_setting('test.org')));
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
select public.change_workspace_member(current_setting('test.org')::uuid,current_setting('test.admin')::uuid,'member');
select public.change_workspace_member(current_setting('test.org')::uuid,current_setting('test.admin')::uuid,'admin');
select public.change_workspace_member(current_setting('test.org')::uuid,current_setting('test.new')::uuid,null);
reset role;
do $$ begin
  if not exists(select 1 from private.api_keys where created_by=current_setting('test.admin')::uuid and org_id=current_setting('test.org')::uuid and revoked_at is not null) then raise exception 'Old keys reactivated';end if;
  if exists(select 1 from private.workspace_invitations where invited_by=current_setting('test.admin')::uuid and org_id=current_setting('test.org')::uuid and revoked_at is null and accepted_at is null) then raise exception 'Demoted issuer invitations remain active';end if;
  if (select count(*) from public.organization_members where user_id=current_setting('test.new')::uuid)<>1 or exists(select 1 from public.organization_members where user_id=current_setting('test.new')::uuid and org_id=current_setting('test.org')::uuid) then raise exception 'Fallback failed';end if;
end $$;
-- Wrong-recipient signup must roll back, never create a personal workspace.
do $$ declare token jsonb; begin
  token:=public.issue_workspace_invitation(current_setting('test.org')::uuid,'recipient@example.invalid','member');
  perform set_config('test.wrong_token',token->>'token',true);
  begin
    insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'wrong@example.invalid',jsonb_build_object('workspace_invitation',token->>'token'));
    raise exception 'Unexpected invited signup success';
  exception when raise_exception then if sqlerrm='Unexpected invited signup success' then raise;end if; end;
end $$;
-- Existing-user acceptance, resend invalidation, revocation, and expiration.
update private.workspace_invitations set sent_at=now()-interval '2 minutes' where token_hash=encode(extensions.digest(current_setting('test.wrong_token'),'sha256'),'hex');
do $$ declare old_inv private.workspace_invitations; renewed jsonb; begin
  select * into old_inv from private.workspace_invitations where token_hash=encode(extensions.digest(current_setting('test.wrong_token'),'sha256'),'hex');
  renewed:=public.issue_workspace_invitation(old_inv.org_id,old_inv.email,old_inv.role,old_inv.id);
  if public.preview_workspace_invitation(current_setting('test.wrong_token')) is not null then raise exception 'Resend did not replace token';end if;
  update private.workspace_invitations set expires_at=now()-interval '1 second' where id=old_inv.id;
  if public.preview_workspace_invitation(renewed->>'token') is not null then raise exception 'Expired invite usable';end if;
  perform public.revoke_workspace_invitation(old_inv.org_id,old_inv.id);
  if public.preview_workspace_invitation(renewed->>'token') is not null then raise exception 'Revoked invite usable';end if;
  perform pg_temp.expect_denied(format('select public.issue_workspace_invitation(%L::uuid,%L,''member'')',old_inv.org_id,old_inv.email));
end $$;
-- Owner deletion keeps accounts, other workspaces, and guarantees fallback.
-- Configured abuse limits count persisted attempts; automatic fallback remains exempt.
update private.workspace_policy set creations_per_hour=1,invites_per_hour=1;
set local role authenticated;
do $$ begin
  perform pg_temp.expect_denied('select public.create_workspace(''Over limit'',gen_random_uuid())');
  perform pg_temp.expect_denied(format('select public.issue_workspace_invitation(%L::uuid,''over-limit@example.invalid'',''member'')',current_setting('test.org')));
end $$;
reset role;
select public.delete_workspace(current_setting('test.org')::uuid,current_setting('test.owner')::uuid,(select name from public.organizations where id=current_setting('test.org')::uuid));
do $$ begin
  if exists(select 1 from public.organizations where id=current_setting('test.org')::uuid) then raise exception 'Workspace not deleted';end if;
  if exists(select 1 from auth.users u where u.id in(current_setting('test.owner')::uuid,current_setting('test.admin')::uuid,current_setting('test.member')::uuid,current_setting('test.new')::uuid) and not exists(select 1 from public.organization_members m where m.user_id=u.id)) then raise exception 'Surviving account has no workspace';end if;
end $$;
rollback;
