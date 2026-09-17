// Internal server-only delivery boundary. Check immediately before EACH provider attempt.
// Unknown/error is not consent. Never log the recipient, credential, or provider body.
export async function emailDeliveryDecision(recipient, env, fetcher = fetch, person = null) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return 'unavailable';
  try {
    const response = await fetcher(new URL('/rest/v1/rpc/email_notifications_allowed', env.NEXT_PUBLIC_SUPABASE_URL), {
      method: 'POST', headers: { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, person }), signal: AbortSignal.timeout(3500), cache: 'no-store',
    });
    if (!response.ok) return 'unavailable';
    const enabled = await response.json();
    return enabled === true ? 'allowed' : enabled === false ? 'suppressed' : 'unavailable';
  } catch { return 'unavailable'; }
}
