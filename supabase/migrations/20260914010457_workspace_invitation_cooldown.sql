create or replace function public.issue_workspace_invitation(target uuid, recipient text, invited_role text, replace_id uuid default null) returns jsonb
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
