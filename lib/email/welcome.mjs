import { emailDeliveryDecision } from './preferences.mjs';
// Internal helper, called only with a user returned by successful signup/verifyOtp.
// It is deliberately not a Server Action or a public send-email endpoint.
export async function deliverWelcome(user, env, fetcher = fetch) {
  if (!user?.id || !user.email || !user.email_confirmed_at) return false;
  if (!env.RESEND_API_KEY || !env.RESEND_TEMPLATE_WELCOME_ID || !env.RESEND_FROM_EMAIL || !env.APP_URL) return false;
  const message = {
    from: env.RESEND_FROM_EMAIL, to: [user.email],
    template: { id: env.RESEND_TEMPLATE_WELCOME_ID, variables: { ACTION_URL: new URL("/dashboard", env.APP_URL).toString() } },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const decision = await emailDeliveryDecision(user.email, env, fetcher, user.id);
    if (decision === 'suppressed') return true; // Intentionally skipped, not a failed delivery.
    if (decision !== 'allowed') return false;
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `welcome-${user.id}` },
        body: JSON.stringify(message), signal: AbortSignal.timeout(3500),
      });
      if (response.ok) return Boolean((await response.json()).id);
      if (response.status !== 429 && response.status < 500) return false;
    } catch { /* Retry a transient connection failure using the same idempotency key. */ }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 650));
  }
  return false;
}
