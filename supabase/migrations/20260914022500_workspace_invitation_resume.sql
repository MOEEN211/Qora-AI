-- A signup consumes its invitation atomically. Later verification may happen
-- after the original invitation expiry; resume only that user's live membership.
create or replace function public.preview_workspace_invitation(invitation_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation private.workspace_invitations;
begin
  if invitation_token is null or invitation_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into invitation from private.workspace_invitations where token_hash=encode(extensions.digest(invitation_token,'sha256'),'hex');
  if not found or invitation.revoked_at is not null then return null; end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by is distinct from auth.uid() or not private.is_org_member(invitation.org_id) then return null; end if;
  elsif invitation.expires_at<=now() then return null;
  end if;
  return jsonb_build_object('workspace',(select name from public.organizations where id=invitation.org_id),'inviter',(select full_name from public.profiles where id=invitation.invited_by),'role',invitation.role,'email',invitation.email,'accepted',invitation.accepted_at is not null);
end;
$$;
