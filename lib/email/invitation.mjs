import { emailDeliveryDecision } from './preferences.mjs';
// Internal mail helper. Inputs must come from the authorized invitation RPC.
export async function deliverInvitation(invitation, env, fetcher = fetch) {
  if (!env.RESEND_API_KEY || !env.RESEND_TEMPLATE_WORKSPACE_INVITATION_ID || !env.APP_URL || !env.RESEND_FROM_EMAIL) return 'failed';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message = {
    from: env.RESEND_FROM_EMAIL, to: [invitation.email],
    template: { id: env.RESEND_TEMPLATE_WORKSPACE_INVITATION_ID, variables: {
      ACTION_URL: new URL(`/invite#token=${invitation.token}`, env.APP_URL).toString(),
      WORKSPACE: escape(invitation.workspace), INVITER: escape(invitation.inviter || 'A workspace administrator'),
      ROLE: invitation.role === 'admin' ? 'Admin' : 'Member',
      EXPIRES: new Date(invitation.expires_at).toLocaleDateString('en-US', {timeZone:'UTC', year:'numeric',month:'long',day:'numeric'}),
    } },
  };
  let uncertain = false;
  for (let attempt=0; attempt<3; attempt++) {
    const decision = await emailDeliveryDecision(invitation.email, env, fetcher);
    if (decision === 'suppressed') return uncertain ? 'unknown' : 'suppressed';
    if (decision !== 'allowed') return 'unknown';
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method:'POST', headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`workspace-invite-${invitation.send_id}`},
        body:JSON.stringify(message),signal:AbortSignal.timeout(3500),
      });
      if(response.ok) return (await response.json()).id ? 'accepted' : 'unknown';
      if(response.status!==429 && response.status<500) return 'failed';
    } catch { uncertain = true; /* A lost response may have been accepted. Preserve the attempt key. */ }
    if(attempt<2) await new Promise(resolve=>setTimeout(resolve,650));
  }
  return 'unknown';
}
