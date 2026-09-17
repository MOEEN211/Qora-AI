// This module is bundled into the hosted function by kickstart and tested in Node.
export function buildAuthMessage(payload, env) {
  const { user, email_data: data } = payload;
  if (!user?.email || !data?.token_hash || !["signup", "recovery", "magiclink"].includes(data.email_action_type)) throw new Error("Unsupported auth email event.");
  let magic = data.email_action_type === "magiclink";
  // New passwordless users may emit signup. Inspect only a fixed presentation
  // hint on our own confirm URL; redirect_to can never choose the destination.
  try {
    const requested = new URL(data.redirect_to);
    if (data.email_action_type === "signup" && requested.origin === new URL(env.FORMA_APP_URL).origin && requested.pathname === "/auth/confirm" && requested.searchParams.get("flow") === "magic") magic = true;
  } catch { /* Missing or untrusted redirect keeps ordinary verification. */ }
  // Only the configured app origin is trusted; never use request-provided redirect_to.
  const actionUrl = new URL("/auth/confirm", env.FORMA_APP_URL);
  actionUrl.searchParams.set("token_hash", data.token_hash);
  actionUrl.searchParams.set("type", data.email_action_type === "recovery" ? "recovery" : "email");
  if (magic) actionUrl.searchParams.set("flow", "magic");
  const template = data.email_action_type === "recovery" ? env.FORMA_RESEND_TEMPLATE_PASSWORD_RESET_ID : magic ? env.FORMA_RESEND_TEMPLATE_MAGIC_LINK_ID : env.FORMA_RESEND_TEMPLATE_VERIFICATION_ID;
  if (!template || !env.FORMA_RESEND_FROM_EMAIL) throw new Error("Email configuration is incomplete.");
  return { from: env.FORMA_RESEND_FROM_EMAIL, to: [user.email], template: { id: template, variables: { ACTION_URL: actionUrl.toString() } } };
}

export function createEmailHook({ env, verify, fetcher = fetch }) {
  return async request => {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    let payload;
    try {
      const body = await request.text();
      if (body.length > 65536) throw new Error();
      // Standard Webhooks validates HMAC and timestamp before any recipient is used.
      payload = await verify(body, Object.fromEntries(request.headers));
    } catch { return Response.json({ error: { http_code: 401, message: "Invalid email hook signature." } }, { status: 401 }); }
    try {
      const message = buildAuthMessage(payload, env);
      // Stable across Supabase retries, without leaking reset tokens into API logs.
      const bytes = new TextEncoder().encode(`${payload.user.id}:${payload.email_data.email_action_type}:${payload.email_data.token_hash}`);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env.FORMA_RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `auth-${digest}` },
        body: JSON.stringify(message), signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.id) throw new Error();
      return Response.json({});
    } catch {
      // Never log the request, token, recipient, or raw provider error.
      return Response.json({ error: { http_code: 500, message: "Email delivery failed. Please try again." } }, { status: 500 });
    }
  };
}
