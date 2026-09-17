-- Explicit lifecycle lock also serializes identifier allocation and ownership transfers.
do $$ begin perform private.lock_workspace_lifecycle(); end $$;
do $$ begin
  if exists(select 1 from public.organizations o where (select count(*) from public.organization_members m where m.org_id=o.id and m.role='owner')<>1) then
    raise exception 'Resolve existing workspace ownership before installing single-owner policy';
  end if;
end $$;
alter table public.organizations drop constraint organizations_slug_check;
create function private.workspace_identifier() returns text
language plpgsql security definer set search_path='' as $$
declare value text; alphabet text:='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; b integer;
begin
  perform private.lock_workspace_lifecycle();
  loop
    value:='WRK';
    while length(value)<13 loop
      b:=get_byte(extensions.gen_random_bytes(1),0);
      if b<252 then value:=value||substr(alphabet,(b%36)+1,1);end if;
    end loop;
    exit when not exists(select 1 from public.organizations where slug=value);
  end loop;
  return value;
end;
$$;
revoke all on function private.workspace_identifier() from public,anon,authenticated;
update public.organizations set slug=private.workspace_identifier();
alter table public.organizations add constraint organizations_slug_check check(slug ~ '^WRK[A-Z0-9]{10}$');
create function private.assign_workspace_identifier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then new.slug:=private.workspace_identifier();
  elsif new.slug is distinct from old.slug then raise exception 'Workspace identifiers cannot be changed';end if;
  return new;
end;
$$;
revoke all on function private.assign_workspace_identifier() from public,anon,authenticated;
create trigger workspace_identifier before insert or update of slug on public.organizations for each row execute function private.assign_workspace_identifier();

create unique index workspace_one_owner on public.organization_members(org_id) where role='owner';
create function private.require_workspace_owner() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='organizations' then target:=new.id;
  elsif tg_op='DELETE' then target:=old.org_id;
  else target:=new.org_id;end if;
  if exists(select 1 from public.organizations where id=target) and not exists(select 1 from public.organization_members where org_id=target and role='owner') then
    raise exception 'Transfer ownership before leaving this workspace';
  end if;
  if tg_table_name='organization_members' and tg_op='UPDATE' then
    if old.org_id is distinct from new.org_id then
      if exists(select 1 from public.organizations where id=old.org_id) and not exists(select 1 from public.organization_members where org_id=old.org_id and role='owner') then
        raise exception 'Transfer ownership before leaving this workspace';
      end if;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.require_workspace_owner() from public,anon,authenticated;
create constraint trigger workspace_requires_owner after insert on public.organizations deferrable initially deferred for each row execute function private.require_workspace_owner();
create constraint trigger membership_requires_owner after insert or update or delete on public.organization_members deferrable initially deferred for each row execute function private.require_workspace_owner();

create or replace function public.change_workspace_member(target uuid, person uuid, new_role text) returns void
language plpgsql security definer set search_path='' as $$
declare actor_role text; old_role text;
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.is_verified_user() then raise exception 'Not permitted';end if;
  select role into actor_role from public.organization_members where org_id=target and user_id=auth.uid();
  select role into old_role from public.organization_members where org_id=target and user_id=person;
  if old_role is null or actor_role is null then raise exception 'Membership no longer available';end if;
  if new_role is not null and new_role not in ('admin','member') then raise exception 'Use Transfer ownership for an active teammate';end if;
  if old_role='owner' then raise exception 'Transfer ownership before leaving this workspace';end if;
  if not (new_role is null and person=auth.uid()) and actor_role not in ('owner','admin') then raise exception 'Not permitted';end if;
  if new_role='admin' and not exists(select 1 from auth.users where id=person and email_confirmed_at is not null) then raise exception 'This person must accept and verify their email first';end if;
  if new_role is null or new_role='member' then
    update private.api_keys set revoked_at=coalesce(revoked_at,now()) where org_id=target and created_by=person;
    update private.workspace_invitations set revoked_at=coalesce(revoked_at,now()) where org_id=target and invited_by=person and accepted_at is null;
  end if;
  if new_role is null then
    delete from public.organization_members where org_id=target and user_id=person;
    perform private.ensure_workspace(person);
  else update public.organization_members set role=new_role where org_id=target and user_id=person;end if;
end;
$$;

create function public.transfer_workspace_ownership(target uuid, person uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.is_verified_user() or not exists(select 1 from public.organization_members where org_id=target and user_id=auth.uid() and role='owner') then raise exception 'Not permitted';end if;
  if person=auth.uid() or not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=target and m.user_id=person and u.email_confirmed_at is not null) then raise exception 'Choose an active teammate to transfer ownership';end if;
  update public.organization_members set role='admin' where org_id=target and user_id=auth.uid();
  update public.organization_members set role='owner' where org_id=target and user_id=person;
end;
$$;
revoke all on function public.transfer_workspace_ownership(uuid,uuid) from public,anon,authenticated;
grant execute on function public.transfer_workspace_ownership(uuid,uuid) to authenticated;

-- A previously emailed Admin offer must not silently become a Member offer.
update private.workspace_invitations set revoked_at=now() where accepted_at is null and revoked_at is null and role='admin';
create or replace function public.issue_workspace_invitation(target uuid, recipient text, invited_role text, replace_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); invitation private.workspace_invitations; policy private.workspace_policy;
begin
  perform private.lock_workspace_lifecycle();
  perform 1 from public.organizations where id=target for update;
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  recipient:=lower(trim(recipient));
  if recipient is null or length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or invited_role is null or invited_role <> 'member' then raise exception 'Enter a valid email and role'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=target and lower(u.email)=recipient) then raise exception 'This person already belongs to the workspace'; end if;
  select * into policy from private.workspace_policy;
  if exists(select 1 from private.workspace_invitations where org_id=target and email=recipient and sent_at>now()-make_interval(secs=>policy.resend_seconds)) then raise exception 'Wait a minute before resending'; end if;
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


-- Include revoked/expired offers for manager filtering; never expose invitation secrets.
create or replace function public.workspace_team(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_org_member(target) then raise exception 'Not permitted';end if;
  return jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name,'email',u.email,'role',m.role,'active',u.email_confirmed_at is not null) order by (m.role='owner') desc,m.created_at,m.user_id)
      from public.organization_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id where m.org_id=target),'[]'::jsonb),
    'invitations',case when private.can_manage_org(target) then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expires_at',i.expires_at,'sent_at',i.sent_at,'send_status',i.send_status,'revoked_at',i.revoked_at) order by i.created_at desc)
      from private.workspace_invitations i where i.org_id=target and i.accepted_at is null),'[]'::jsonb) else '[]'::jsonb end);
end;
$$;
