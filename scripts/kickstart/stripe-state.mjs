import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const publicStripeField = key => /^STRIPE_(TEST|LIVE)_(SECRET_KEY|WEBHOOK_SECRET|PRODUCT_ID_(STARTER|PRO|GROWTH))$/.test(key);

// Internal setup details can include reconciliation tokens. Never publish this
// ignored file, copy it to application runtime, or include it in reports.
export async function stripeState(root, projectRef) {
  if (!/^[a-z0-9]{20}$/.test(projectRef || "")) throw new Error("Invalid Stripe setup project reference.");
  const path = resolve(root, ".secrets", `${projectRef}-stripe-setup.json`);
  let values = {};
  try { values = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Restore the unreadable private Stripe setup state."); }
  return { values, async save(next) {
    Object.assign(values, next);
    await mkdir(resolve(root, ".secrets"), { recursive: true });
    await writeFile(path + ".tmp", JSON.stringify(values, null, 2), { mode: 0o600 });
    await rename(path + ".tmp", path);
  } };
}

// Explicit local upgrade: preserve removed values before changing .env. This
// makes no provider requests and keeps every retained variable's value intact.
export async function compactStripeEnv(root) {
  const path = resolve(root, ".env");
  const source = await readFile(path, "utf8");
  const parsed = parseEnv(source);
  const removed = Object.fromEntries(Object.entries(parsed).filter(([key]) => key.startsWith("STRIPE_") && !publicStripeField(key)));
  if (!Object.keys(removed).length) return;
  const state = await stripeState(root, parsed.SUPABASE_PROJECT_REF);
  await state.save(removed);
  const updated = source.replace(/^(?:export\s+)?STRIPE_[A-Z0-9_]+\s*=.*(?:\r?\n|$)/gm, line => publicStripeField(line.match(/STRIPE_[A-Z0-9_]+/)[0]) ? line : "");
  const after = parseEnv(updated);
  if (Object.keys(after).some(key => key.startsWith("STRIPE_") && !publicStripeField(key)) || Object.entries(parsed).some(([key,value]) => !(key in removed) && after[key] !== value)) throw new Error("Could not safely simplify Stripe environment fields.");
  if (await readFile(path, "utf8") !== source) throw new Error(".env changed while simplifying Stripe. Retry.");
  await writeFile(path + ".stripe.tmp", updated, { mode: 0o600 });
  await rename(path + ".stripe.tmp", path);
}
