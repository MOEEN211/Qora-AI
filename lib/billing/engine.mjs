// Shared by Next.js and the hosted webhook. Stripe is injected, never global.
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
export const TERMINAL = ["canceled", "incomplete_expired"];
export const BILLING_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "checkout.session.completed", "checkout.session.expired"];

export function summarizeSubscription(subscriptions, catalog) {
  const current = subscriptions.filter(s => !TERMINAL.includes(s.status));
  if (current.length > 1) throw new Error("Multiple subscriptions found. Resolve them in Stripe before continuing.");
  const subscription = current[0] || [...subscriptions].sort((a, b) => b.created - a.created)[0];
  if (!subscription) return { status: "none", paid: false, reporting: { known: true, mrr_minor: 0, subscriber: false, churned: false } };
  const item = subscription.items.data[0];
  const plan = catalog.find(p => p.product_id === (typeof item?.price.product === "string" ? item.price.product : item?.price.product?.id));
  // Unknown/manual multi-item subscriptions must never accidentally grant access.
  const supported = !!plan && subscription.items.data.length === 1 && item.quantity === 1;
  return {
    id: subscription.id, status: subscription.status,
    plan: plan?.key || null, name: plan?.name || "Custom subscription",
    price_id: item?.price.id || null, interval: item?.price.recurring?.interval || null,
    amount: item?.price.unit_amount ?? null, currency: item?.price.currency || null,
    period_start: item?.current_period_start || null,
    period_end: item?.current_period_end || null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    ended_at: subscription.ended_at || null,
    reporting: subscriptionReporting(subscription, supported),
    paid: supported && ["active", "trialing"].includes(subscription.status),
  };
}

// Financial reporting never changes the application's entitlement decision.
export function subscriptionReporting(subscription, supported, now = Date.now() / 1000) {
  const item = subscription.items.data[0], price = item?.price;
  const interval = price?.recurring?.interval;
  const valid = supported && ['month','year'].includes(interval) && (price.recurring.interval_count ?? 1) === 1 && Number.isSafeInteger(price.unit_amount) && price.unit_amount >= 0;
  if (!valid) return { known: false, mrr_minor: null, subscriber: false, churned: false };
  let amount = price.unit_amount;
  const product = typeof price.product === 'string' ? price.product : price.product?.id;
  // Item discounts apply before subscription discounts; preserve Stripe's array order.
  for (const discount of [...(item.discounts || []), ...(subscription.discounts || [])]) {
    if (typeof discount !== 'object' || !discount.source?.coupon || typeof discount.source.coupon !== 'object') return { known: false, mrr_minor: null, subscriber: false, churned: false };
    const coupon = discount.source.coupon;
    if (discount.start > now || (discount.end && discount.end <= now) || coupon.duration === 'once') continue;
    if (coupon.applies_to?.products && !coupon.applies_to.products.includes(product)) continue;
    if (coupon.percent_off != null) amount *= (1 - coupon.percent_off / 100);
    else if (coupon.amount_off != null && coupon.currency === price.currency) amount = Math.max(0, amount - coupon.amount_off);
    else return { known: false, mrr_minor: null, subscriber: false, churned: false };
  }
  const subscriber = ['active','past_due'].includes(subscription.status) && price.unit_amount > 0;
  return { known: true, mrr_minor: subscriber ? amount / (interval === 'year' ? 12 : 1) : 0, subscriber, churned: ['canceled','unpaid'].includes(subscription.status) };
}

export async function syncAccount({ stripe, rpc, account, token, catalog, eventId = null }) {
  const subscriptions = [];
  if (account.customer_id) {
    for await (const sub of stripe.subscriptions.list({ customer: account.customer_id, status: "all", limit: 100, expand: ['data.discounts','data.items.data.discounts'] })) {
      // Discount IDs cannot be retrieved directly. Expand first, then read coupon references.
      for (const discount of [...(sub.discounts || []), ...sub.items.data.flatMap(item => item.discounts || [])]) {
        if (typeof discount === 'object' && typeof discount.source?.coupon === 'string') {
          try { discount.source.coupon = await stripe.coupons.retrieve(discount.source.coupon); }
          catch { /* Preserve entitlement synchronization; report incomplete financial data. */ }
        }
      }
      subscriptions.push(sub);
    }
  }
  const snapshot = summarizeSubscription(subscriptions, catalog);
  await rpc("commit", { id: account.id, token, snapshot, event_id: eventId });
  return snapshot;
}

export async function withBillingLease(rpc, target, work) {
  const claim = await rpc("claim", target);
  if (!claim) throw new Error("Billing is busy. Please try again shortly.");
  try { return await work(claim.account, claim.token); }
  finally { await rpc("release", { id: claim.account.id, token: claim.token }); }
}

export async function startCheckout({ stripe, rpc, user, workspaceId, mode, stripeAccount, price, catalog, appUrl }) {
  return withBillingLease(rpc, { user_id: user.id, org_id: workspaceId, mode, stripe_account: stripeAccount }, async (account, token) => {
    if (!account.customer_id) {
      // The durable attempt predates the API call; beyond Stripe's guaranteed
      // idempotency window, stop instead of risking a second customer.
      const attempt = await rpc("customer_attempt", { id: account.id, token, email: user.email });
      const found = await stripe.customers.search({ query: `metadata['forma_account']:'${account.id}'`, limit: 100 });
      if(found.has_more || found.data.length>1) throw new Error("Customer setup needs reconciliation. Contact support.");
      if (!found.data.length && Date.now() - new Date(attempt.started_at).getTime() > 23 * 3600000) throw new Error("Customer setup needs reconciliation. Contact support.");
      const customer = found.data[0] || await stripe.customers.create({ email: attempt.email, metadata: { forma_account: account.id } }, { idempotencyKey: `forma-customer-${attempt.id}` });
      await rpc("customer", { id: account.id, token, customer_id: customer.id });
      account.customer_id = customer.id;
    }
    const current = await syncAccount({ stripe, rpc, account, token, catalog });
    if (current.status !== "none" && !TERMINAL.includes(current.status)) throw new Error("You already have a subscription. Use Manage subscription to change it.");
    const attempt = await rpc("checkout_attempt", { id: account.id, token, price_id: price.id, app_url: appUrl });
    // One open session per account, even across tabs selecting different plans.
    // Store all request parameters once so retries have identical bodies.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: account.customer_id,
      line_items: [{ price: attempt.price_id, quantity: 1 }],
      client_reference_id: account.id,
      subscription_data: { metadata: { forma_account: account.id } },
      metadata: { forma_account: account.id },
      integration_identifier: "forma_subscriptions_hjkdplmq",
      success_url: `${attempt.app_url}/dashboard/account?tab=billing&checkout=returned`,
      cancel_url: `${attempt.app_url}/dashboard/account?tab=billing`,
      expires_at: attempt.expires_at,
    }, { idempotencyKey: `forma-checkout-${attempt.id}` });
    if (session.status === "complete") throw new Error("Your payment is processing. Refresh billing shortly.");
    if (session.status !== "open" || !session.url) throw new Error("Checkout expired. Refresh billing and try again.");
    await rpc("checkout_session", { id: account.id, token, session_id: session.id });
    return session.url;
  });
}
