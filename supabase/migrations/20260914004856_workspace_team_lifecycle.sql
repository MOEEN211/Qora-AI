-- Workspace lifecycle operations share an advisory lock before organization-row
-- locks. This deliberately serializes infrequent team mutations across the app,
-- including cross-workspace fallback and Auth deletion. Ordinary reads do not lock.
create function private.lock_workspace_lifecycle() returns void
language sql security definer set search_path='' as $$
  select pg_advisory_xact_lock(184703, 1);
$$;
revoke all on function private.lock_workspace_lifecycle() from public, anon, authenticated;

create table private.workspace_policy (
  singleton boolean primary key default true check(singleton),
  creations_per_hour integer not null default 5 check(creations_per_hour>0),
  invites_per_hour integer not null default 30 check(invites_per_hour>0),
  resend_seconds integer not null default 60 check(resend_seconds>0)
);
insert into private.workspace_policy default values;
create table private.workspace_creations (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(actor,request_id)
);
create table private.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check(length(email)<=254 and email=lower(trim(email))),
  role text not null check(role in ('admin','member')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz not null default now(),
  send_id uuid not null default gen_random_uuid(),
  send_status text not null default 'unknown' check(send_status in ('unknown','accepted','failed'))
);
create unique index workspace_invitation_pending on private.workspace_invitations(org_id,email)
  where accepted_at is null and revoked_at is null;
create table private.workspace_invitation_sends (
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index workspace_invitation_sends_org on private.workspace_invitation_sends(org_id,created_at);
alter table private.workspace_policy enable row level security;
alter table private.workspace_creations enable row level security;
alter table private.workspace_invitations enable row level security;
alter table private.workspace_invitation_sends enable row level security;
revoke all on private.workspace_policy, private.workspace_creations, private.workspace_invitations,
  private.workspace_invitation_sends from public,anon,authenticated;

create function private.ensure_workspace(person uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; display_name text;
begin
  perform private.lock_workspace_lifecycle();
  select org_id into target from public.organization_members where user_id=person order by created_at,org_id limit 1;
  if target is not null then return target; end if;
  select left(coalesce(nullif(full_name,''),'My'),60) into display_name from public.profiles where id=person;
  if not found then return null; end if;
  target:=gen_random_uuid();
  insert into public.organizations(id,name,slug) values(target,left(display_name||'''s workspace',80),'workspace-'||replace(target::text,'-',''));
  insert into public.organization_members(org_id,user_id,role) values(target,person,'owner');
  return target;
end;
$$;
revoke all on function private.ensure_workspace(uuid) from public,anon,authenticated;

create function public.create_workspace(workspace_name text, request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; cap integer;
begin
  perform private.lock_workspace_lifecycle();
  if not private.is_verified_user() then raise exception 'Not permitted'; end if;
  if request_id is null or workspace_name is null or length(trim(workspace_name)) not between 2 and 80 then raise exception 'Use a workspace name between 2 and 80 characters'; end if;
  select c.org_id into target from private.workspace_creations c where c.actor=auth.uid() and c.request_id=create_workspace.request_id;
  if found then
    if target is null or not private.is_org_member(target) then raise exception 'This creation request has already been used'; end if;
    return target;
  end if;
  select creations_per_hour into cap from private.workspace_policy;
  if (select count(*) from private.workspace_creations where actor=auth.uid() and created_at>now()-interval '1 hour')>=cap then raise exception 'Workspace creation limit reached. Try again in an hour'; end if;
  target:=gen_random_uuid();
  insert into public.organizations(id,name,slug) values(target,trim(workspace_name),'workspace-'||replace(target::text,'-',''));
  insert into public.organization_members values(target,auth.uid(),'owner',now());
  insert into private.workspace_creations(actor,request_id,org_id) values(auth.uid(),request_id,target);
  return target;
end;
$$;

create function public.workspace_team(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_org_member(target) then raise exception 'Not permitted'; end if;
  return jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name,'email',u.email,'role',m.role,'joined_at',m.created_at) order by m.created_at,m.user_id)
      from public.organization_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id where m.org_id=target),'[]'::jsonb),
    'invitations',case when private.can_manage_org(target) then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expires_at',i.expires_at,'sent_at',i.sent_at,'send_status',i.send_status) order by i.created_at desc)
      from private.workspace_invitations i where i.org_id=target and i.accepted_at is null and i.revoked_at is null),'[]'::jsonb) else '[]'::jsonb end);
end;
$$;

create function public.issue_workspace_invitation(target uuid, recipient text, invited_role text, replace_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); invitation private.workspace_invitations; policy private.workspace_policy;
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  recipient:=lower(trim(recipient));
  if recipient is null or length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or invited_role is null or invited_role not in ('admin','member') then raise exception 'Enter a valid email and role'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=target and lower(u.email)=recipient) then raise exception 'This person already belongs to the workspace'; end if;
  select * into policy from private.workspace_policy;
  if (select count(*) from private.workspace_invitation_sends where org_id=target and created_at>now()-interval '1 hour')>=policy.invites_per_hour then raise exception 'Invitation send limit reached. Try again in an hour'; end if;
  select * into invitation from private.workspace_invitations where org_id=target and email=recipient and accepted_at is null and revoked_at is null;
  if found then
    if replace_id is distinct from invitation.id then raise exception 'An invitation already exists. Use Resend'; end if;
    if invitation.sent_at>now()-make_interval(secs=>policy.resend_seconds) then raise exception 'Wait a minute before resending'; end if;
    update private.workspace_invitations set token_hash=encode(extensions.digest(token,'sha256'),'hex'),expires_at=now()+interval '7 days',sent_at=now(),send_id=gen_random_uuid(),send_status='unknown',invited_by=auth.uid(),role=invited_role where id=invitation.id returning * into invitation;
  else
    if replace_id is not null then raise exception 'This invitation is no longer pending'; end if;
    insert into private.workspace_invitations(org_id,email,role,token_hash,expires_at,invited_by) values(target,recipient,invited_role,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '7 days',auth.uid()) returning * into invitation;
  end if;
  insert into private.workspace_invitation_sends(org_id) values(target);
  return jsonb_build_object('id',invitation.id,'send_id',invitation.send_id,'token',token,'email',recipient,'role',invitation.role,'expires_at',invitation.expires_at,
    'workspace',(select name from public.organizations where id=target),'inviter',(select full_name from public.profiles where id=auth.uid()));
end;
$$;

-- Receipt writes are server-only; an ordinary caller cannot claim delivery.
create function public.record_invitation_send(invitation_id uuid, attempt uuid, status text) returns void
language sql security definer set search_path='' as $$
  update private.workspace_invitations set send_status=status where id=invitation_id and send_id=attempt and status in ('accepted','unknown','failed');
$$;
create function public.revoke_workspace_invitation(target uuid, invitation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  update private.workspace_invitations set revoked_at=coalesce(revoked_at,now()) where id=invitation_id and org_id=target and accepted_at is null;
end;
$$;

create function public.preview_workspace_invitation(invitation_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation private.workspace_invitations;
begin
  if invitation_token is null or invitation_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into invitation from private.workspace_invitations where token_hash=encode(extensions.digest(invitation_token,'sha256'),'hex');
  if not found or invitation.revoked_at is not null or invitation.expires_at<=now() then return null; end if;
  if invitation.accepted_at is not null and invitation.accepted_by is distinct from auth.uid() then return null; end if;
  return jsonb_build_object('workspace',(select name from public.organizations where id=invitation.org_id),'inviter',(select full_name from public.profiles where id=invitation.invited_by),'role',invitation.role,'email',invitation.email,'accepted',invitation.accepted_at is not null);
end;
$$;

create function public.accept_workspace_invitation(invitation_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation private.workspace_invitations; email_address text;
begin
  perform private.lock_workspace_lifecycle();
  if not private.is_verified_user() then raise exception 'Verify your email before accepting'; end if;
  if invitation_token is null or invitation_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  select * into invitation from private.workspace_invitations where token_hash=encode(extensions.digest(invitation_token,'sha256'),'hex');
  if not found or invitation.revoked_at is not null then raise exception 'Invitation no longer available'; end if;
  select lower(email) into email_address from auth.users where id=auth.uid();
  if email_address is distinct from invitation.email then raise exception 'Sign in with the invited email address'; end if;
  perform 1 from public.organizations where id=invitation.org_id for update;
  if invitation.accepted_by=auth.uid() and private.is_org_member(invitation.org_id) then return invitation.org_id; end if;
  if invitation.accepted_at is not null or invitation.expires_at<=now() then raise exception 'Invitation expired or already used'; end if;
  insert into public.organization_members(org_id,user_id,role) values(invitation.org_id,auth.uid(),invitation.role) on conflict do nothing;
  update private.workspace_invitations set accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
  return invitation.org_id;
end;
$$;

-- The metadata token is an untrusted credential, never a role/org assertion.
-- Its digest, recipient and lifecycle are validated against private server records.
create or replace function private.bootstrap_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare invitation private.workspace_invitations; token text:=new.raw_user_meta_data->>'workspace_invitation';
  display_name text:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1),'My'),60);
begin
  perform private.lock_workspace_lifecycle();
  if token is not null then
    if token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
    select * into invitation from private.workspace_invitations where token_hash=encode(extensions.digest(token,'sha256'),'hex');
    if not found or invitation.email is distinct from lower(new.email) or invitation.revoked_at is not null or invitation.accepted_at is not null or invitation.expires_at<=now() then raise exception 'Invitation no longer available'; end if;
    perform 1 from public.organizations where id=invitation.org_id for update;
    insert into public.profiles(id,full_name) values(new.id,display_name);
    insert into public.organization_members(org_id,user_id,role) values(invitation.org_id,new.id,invitation.role);
    update private.workspace_invitations set accepted_by=new.id,accepted_at=now() where id=invitation.id;
  else
    insert into public.profiles(id,full_name) values(new.id,display_name);
    perform private.ensure_workspace(new.id);
  end if;
  return new;
end;
$$;

create function public.change_workspace_member(target uuid, person uuid, new_role text) returns void
language plpgsql security definer set search_path='' as $$
declare actor_role text; old_role text;
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.is_verified_user() then raise exception 'Not permitted'; end if;
  select role into actor_role from public.organization_members where org_id=target and user_id=auth.uid();
  select role into old_role from public.organization_members where org_id=target and user_id=person;
  if old_role is null or actor_role is null then raise exception 'Membership no longer available'; end if;
  if new_role is not null and new_role not in ('owner','admin','member') then raise exception 'Invalid role'; end if;
  if not (new_role is null and person=auth.uid()) then
    if actor_role not in ('owner','admin') or (actor_role='admin' and (old_role='owner' or new_role='owner')) then raise exception 'Not permitted'; end if;
  end if;
  if old_role='owner' and new_role is distinct from 'owner' and not exists(select 1 from public.organization_members where org_id=target and role='owner' and user_id<>person) then raise exception 'Promote another owner before leaving or removing ownership'; end if;
  if new_role is null or new_role='member' then
    update private.api_keys set revoked_at=coalesce(revoked_at,now()) where org_id=target and created_by=person;
    update private.workspace_invitations set revoked_at=coalesce(revoked_at,now()) where org_id=target and invited_by=person and accepted_at is null;
  end if;
  if new_role is null then
    delete from public.organization_members where org_id=target and user_id=person;
    perform private.ensure_workspace(person);
  else
    update public.organization_members set role=new_role where org_id=target and user_id=person;
  end if;
end;
$$;

-- Only the server after password reauthentication can call deletion.
create function public.delete_workspace(target uuid, actor uuid, confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare members uuid[]; person uuid; workspace_name text;
begin
  perform private.lock_workspace_lifecycle();
  select name into workspace_name from public.organizations where id=target for update;
  if workspace_name is null or confirmation is distinct from workspace_name or not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=target and m.user_id=actor and m.role='owner' and u.email_confirmed_at is not null) then raise exception 'Not permitted'; end if;
  if to_regclass('public.subscriptions') is not null then raise exception 'Resolve billing before deleting workspaces'; end if;
  select array_agg(user_id order by user_id) into members from public.organization_members where org_id=target;
  delete from public.organizations where id=target;
  foreach person in array members loop perform private.ensure_workspace(person); end loop;
end;
$$;

create or replace function private.guard_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_workspace_lifecycle();
  if to_regclass('public.subscriptions') is not null then raise exception 'Resolve billing before deleting accounts'; end if;
  perform o.id from public.organizations o join public.organization_members m on m.org_id=o.id where m.user_id=old.id order by o.id for update of o;
  if exists(select 1 from public.organization_members m where m.user_id=old.id and m.role='owner'
    and exists(select 1 from public.organization_members x where x.org_id=m.org_id and x.user_id<>old.id)
    and not exists(select 1 from public.organization_members x where x.org_id=m.org_id and x.user_id<>old.id and x.role='owner')) then raise exception 'Transfer workspace ownership before deleting your account'; end if;
  update private.workspace_invitations set revoked_at=coalesce(revoked_at,now()) where invited_by=old.id and accepted_at is null;
  delete from public.organizations o using public.organization_members m where m.org_id=o.id and m.user_id=old.id and m.role='owner' and not exists(select 1 from public.organization_members x where x.org_id=o.id and x.user_id<>old.id);
  return old;
end;
$$;

revoke all on function public.create_workspace(text,uuid), public.workspace_team(uuid), public.issue_workspace_invitation(uuid,text,text,uuid),
 public.record_invitation_send(uuid,uuid,text),public.revoke_workspace_invitation(uuid,uuid),public.preview_workspace_invitation(text),
 public.accept_workspace_invitation(text),public.change_workspace_member(uuid,uuid,text),public.delete_workspace(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_workspace(text,uuid),public.workspace_team(uuid),public.issue_workspace_invitation(uuid,text,text,uuid),
 public.revoke_workspace_invitation(uuid,uuid),public.accept_workspace_invitation(text),public.change_workspace_member(uuid,uuid,text) to authenticated;
grant execute on function public.preview_workspace_invitation(text) to anon,authenticated;
grant execute on function public.record_invitation_send(uuid,uuid,text),public.delete_workspace(uuid,uuid,text) to service_role;
