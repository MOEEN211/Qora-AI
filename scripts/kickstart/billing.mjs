import Stripe from "stripe";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { digest, sqlString, functionReceipt, matchesFunctionReceipt } from "./core.mjs";
import { saveGeneratedEnv } from "./env-file.mjs";
import { stripeState, compactStripeEnv, publicStripeField } from "./stripe-state.mjs";
import { STRIPE_API_VERSION, BILLING_EVENTS } from "../../lib/billing/engine.mjs";
import { testEmailDeploymentAllowed } from "./environment.mjs";

export function selectPrices(product, prices, allowMissing = false) {
  const recurring = prices.filter(p => p.active && p.product === product.id);
  return ["month", "year"].map(interval => {
    const matches = recurring.filter(p => p.recurring?.interval === interval && p.recurring.interval_count === 1);
    if (!matches.length && allowMissing) return null;
    if (matches.length !== 1) throw new Error(`${product.name}: keep exactly one active ${interval} price. Archive superseded prices in Stripe test mode.`);
    const p = matches[0];
    if (p.billing_scheme !== "per_unit" || p.recurring.usage_type !== "licensed" || !Number.isSafeInteger(p.unit_amount) || p.unit_amount <= 0 || p.currency_options || p.transform_quantity) throw new Error(`${product.name}: use a positive flat recurring price with one currency and no quantity transformation.`);
    return { id: p.id, interval, amount: p.unit_amount, currency: p.currency, tax_behavior: p.tax_behavior || "unspecified" };
  }).filter(Boolean);
}
const fields = p => ({ name: p.name, description: p.description || "", active: p.active, images: p.images || [], tax_code: typeof p.tax_code === "string" ? p.tax_code : p.tax_code?.id || null });
const fingerprint = p => digest(JSON.stringify(fields(p)));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==="object" ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
const featureHash = value => digest(JSON.stringify(canonical(value)));
const contains = (actual, expected) => {
  if(Array.isArray(expected)) return Array.isArray(actual) && actual.length===expected.length && expected.every(value=>actual.some(item=>contains(item,value)));
  if(expected && typeof expected==="object") return !!actual && Object.entries(expected).every(([key,value])=>contains(actual[key],value));
  return actual===expected;
};
const prefix = mode => `STRIPE_${mode.toUpperCase()}`;
const all = async iterable => { const items=[]; for await(const item of iterable) items.push(item); return items; };

export async function createBillingSetup({ root, env, api, deploy = false, sourceProjectRef = env.SUPABASE_PROJECT_REF, stripeFactory = key => new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20000 }) }) {
  const mode = deploy ? "live" : "test";
  const internal = await stripeState(root, sourceProjectRef);
  // Read legacy fields for an in-place upgrade; write their private replacement
  // only after the complete provider preflight passes.
  Object.assign(internal.values, Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith("STRIPE_") && !publicStripeField(key))));
  const state = internal.values;
  const namespace = state.STRIPE_CATALOG_ID || `forma_${sourceProjectRef}`;
  const seed = JSON.parse(await readFile(resolve(root,"config/billing-seed.json"),"utf8"));
  const statePath = resolve(root,".kickstart",`${env.SUPABASE_PROJECT_REF}-stripe-${mode}.json`);
  let receipt = {};
  try { receipt = JSON.parse(await readFile(statePath,"utf8")); } catch(error) { if(error.code!=="ENOENT") throw new Error("Restore the unreadable Stripe kickstart receipt."); }
  let testStripe, stripe, stripeAccount, testAccount, source=[], products=[], prices=[], endpoints=[], portals=[], functions=[], secrets=[], catalog=[];
  const sourceText = await readFile(resolve(root,"supabase/functions/stripe-billing/index.js"),"utf8");
  const sharedText = await readFile(resolve(root,"lib/billing/engine.mjs"),"utf8");
  const functionSource = sourceText.replace('import { STRIPE_API_VERSION, BILLING_EVENTS, syncAccount, withBillingLease } from "../../../lib/billing/engine.mjs";',sharedText);
  const slug = `forma-billing-${mode}-${digest(functionSource).slice(0,12)}`;
  const endpointUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${slug}`;
  const save = async values => { await saveGeneratedEnv(resolve(root,".env"),values); Object.assign(env,values); };
  const saveReceipt = async () => { await mkdir(resolve(root,".kickstart"),{recursive:true}); await writeFile(statePath+".tmp",JSON.stringify(receipt,null,2),{mode:0o600}); await rename(statePath+".tmp",statePath); };
  const keys = ["SECRET_KEY"];
  const probe = { name:`Stripe ${mode} account, catalog, webhook and portal preflight`, run:async()=>{
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(namespace)) throw new Error("Restore the invalid catalog namespace in private Stripe setup state.");
    for (const m of deploy ? ["test","live"] : ["test"]) {
      for (const kind of keys) if(!new RegExp(`^[sr]k_${m}_`).test(env[`${prefix(m)}_${kind}`]||"")) throw new Error(`Fill ${prefix(m)}_${kind} in .env using the Stripe Secret key (sk_${m}_...), not a Publishable key. Restricted keys need all documented permissions.`);
    }
    if(deploy && (!env.APP_URL_LIVE || !env.APP_URL_LIVE.startsWith("https://") || env.APP_URL!==env.APP_URL_LIVE || (env.RESEND_TEST_MODE==="true" && !testEmailDeploymentAllowed(env)))) throw new Error("Deploy kickstart requires APP_URL=APP_URL_LIVE, an HTTPS origin and a verified sender or explicit temporary test-email deployment.");
    testStripe = stripeFactory(env.STRIPE_TEST_SECRET_KEY);
    stripe = deploy ? stripeFactory(env.STRIPE_LIVE_SECRET_KEY) : testStripe;
    testAccount = await testStripe.accounts.retrieve();
    if(state.STRIPE_TEST_ACCOUNT_ID && state.STRIPE_TEST_ACCOUNT_ID!==testAccount.id) throw new Error("The test catalog key belongs to a different Stripe account. Restore its matching key.");
    stripeAccount = deploy ? await stripe.accounts.retrieve() : testAccount;
    if(deploy && !stripeAccount.charges_enabled) throw new Error("Finish Stripe live account activation before deployment.");
    if(receipt.account && receipt.account!==stripeAccount.id || receipt.namespace && receipt.namespace!==namespace) throw new Error("Stripe account/catalog target changed. Restore the matching configuration and receipt.");
    if(state[`${prefix(mode)}_ACCOUNT_ID`] && state[`${prefix(mode)}_ACCOUNT_ID`]!==stripeAccount.id) throw new Error("Stored Stripe account ID does not match this key.");
    const [installed]=await api.query("select to_regclass('private.billing_catalog') is not null as installed");
    if(installed.installed) {
      const existing=await api.query(`select stripe_account from private.billing_catalog where mode=${sqlString(mode)}`);
      if(existing[0] && existing[0].stripe_account!==stripeAccount.id) throw new Error("The hosted billing catalog belongs to another Stripe account. Reconcile the target before provisioning.");
    }
    const runtime = stripe;
    await Promise.all([runtime.customers.list({limit:1}),runtime.subscriptions.list({limit:1}),runtime.prices.list({limit:1}),runtime.products.list({limit:1}),runtime.checkout.sessions.list({limit:1})]);
    [products,prices,endpoints,portals,functions,secrets] = await Promise.all([
      all(stripe.products.list({limit:100})),all(stripe.prices.list({limit:100})),all(stripe.webhookEndpoints.list({limit:100})),all(stripe.billingPortal.configurations.list({limit:100,expand:["data.features.subscription_update.products"]})),api.management("/functions"),api.management("/secrets")]);
    if([...products,...prices,...endpoints,...portals].some(p=>p.livemode!==(mode==="live"))) throw new Error("Stripe returned resources from the wrong mode.");
    const selectedPortal=portals.find(p=>p.id===state[`${prefix(mode)}_PORTAL_CONFIGURATION_ID`]);
    if(state[`${prefix(mode)}_PORTAL_CONFIGURATION_ID`] && (!selectedPortal || selectedPortal.metadata?.forma_catalog!==namespace)) throw new Error("Stored portal configuration doesn't belong to this catalog.");
    if(selectedPortal && receipt.portal?.id===selectedPortal.id && receipt.portal.features!==featureHash(selectedPortal.features)) throw new Error("Managed portal features changed outside kickstart. Reconcile them before provisioning.");
    const sourceProducts = deploy ? await all(testStripe.products.list({limit:100})) : products;
    const sourcePrices = deploy ? await all(testStripe.prices.list({limit:100})) : prices;
    source = seed.plans.map(plan=>{
      const matches=sourceProducts.filter(p=>p.metadata?.forma_catalog===namespace && p.metadata?.forma_plan===plan.key);
      if(matches.length>1) throw new Error(`Duplicate ${plan.key} products. Reconcile the test catalog.`);
      const product=matches[0];
      if(!product && deploy) throw new Error("Run test kickstart before promoting the catalog to live.");
      if(product && !product.active) throw new Error(`${plan.key} is archived. Restore the test product before setup.`);
      return { plan, product, prices:product ? selectPrices(product,sourcePrices,!deploy && receipt.initializing?.[plan.key] === true) : null };
    });
    const currencies=new Set(source.flatMap(p=>p.prices||[]).map(p=>p.currency));
    if(currencies.size>1) throw new Error("Use one currency across all six prices for portal plan switching.");
    for(const {plan} of source) {
      const matches=products.filter(p=>p.metadata?.forma_catalog===namespace && p.metadata?.forma_plan===plan.key);
      if(matches.length>1) throw new Error(`Duplicate target ${plan.key} products.`);
      const p=matches[0];
      const stored=env[`${prefix(mode)}_PRODUCT_ID_${plan.key.toUpperCase()}`];
      if(stored && p?.id!==stored) throw new Error(`Stored ${plan.key} product doesn't match this catalog.`);
      if(deploy && p && ![receipt.products?.[p.id],receipt.productBefore?.[p.id]].includes(fingerprint(p)) && !(receipt.initializing?.[plan.key] && fingerprint(p)===fingerprint(source.find(s=>s.plan.key===plan.key).product))) throw new Error("A live product changed outside kickstart, or its receipt is missing. Reconcile it before promotion; live edits will not be overwritten.");
    }
    const fn=functions.find(f=>f.slug===slug);
    if(fn && !matchesFunctionReceipt(fn,receipt.function)) throw new Error("Billing function drift detected. Reconcile the function receipt.");
    for(const name of billingSecretNames(mode)) {
      const existing=secrets.find(s=>s.name===name);
      if(existing && ![receipt.secrets?.[name]?.before,receipt.secrets?.[name]?.after].includes(existing.value)) throw new Error(`Billing secret ${name} drifted. Restore or reconcile its receipt.`);
    }
    const hooks=endpoints.filter(e=>e.url===endpointUrl);
    if(hooks.length>1 || hooks.some(e=>e.metadata?.forma_catalog!==namespace)) throw new Error("Unexpected billing webhook at this URL. Reconcile it before setup.");
    if(hooks[0] && (!env[`${prefix(mode)}_WEBHOOK_SECRET`] || state[`${prefix(mode)}_WEBHOOK_ID`]!==hooks[0].id || (state[`${prefix(mode)}_WEBHOOK_SECRET_HASH`] && state[`${prefix(mode)}_WEBHOOK_SECRET_HASH`]!==digest(env[`${prefix(mode)}_WEBHOOK_SECRET`])))) throw new Error(`Restore ${prefix(mode)}_WEBHOOK_SECRET from Stripe Workbench and restore the matching private setup state before retrying. Stripe only returns the secret on creation; no duplicate endpoint will be created.`);
    // Cron/Vault support is inspected without installing extensions.
    const [extensions]=await api.query("select count(*)::int as available from pg_available_extensions where name in ('pg_cron','pg_net','supabase_vault')");
    if(extensions.available!==3) throw new Error("This hosted project must support pg_cron, pg_net and Supabase Vault for billing reconciliation.");
    return "Account/mode and read permissions checked. Write-only Checkout, portal-session, webhook and provisioning permissions are verified during actual use; no test payments made.";
  }};
  const step = { name:`Provision and verify ${mode} Stripe catalog and hosted billing`, run:async()=>{
    await compactStripeEnv(root);
    receipt={...receipt,account:stripeAccount.id,namespace,products:receipt.products||{},productBefore:receipt.productBefore||{},initializing:receipt.initializing||{}};
    const installedFunction=functions.find(f=>f.slug===slug);
    if(installedFunction) receipt.function=functionReceipt(installedFunction);
    await saveReceipt();
    await internal.save({STRIPE_CATALOG_ID:namespace,[`${prefix(mode)}_ACCOUNT_ID`]:stripeAccount.id});
    for(const entry of source) {
      const {plan}=entry;
      let product=products.find(p=>p.metadata?.forma_catalog===namespace && p.metadata?.forma_plan===plan.key);
      const desired=deploy ? fields(entry.product) : {name:plan.name,description:plan.description};
      const metadata={forma_catalog:namespace,forma_plan:plan.key};
      if(!product) {
        receipt.initializing[plan.key]=true; await saveReceipt();
        product=await stripe.products.create({id:`forma_${digest(namespace).slice(0,16)}_${plan.key}_${mode}`,...desired,tax_code:desired.tax_code||undefined,metadata});
      } else if(deploy && fingerprint(product)!==fingerprint({...product,...desired})) {
        receipt.productBefore[product.id]=fingerprint(product); receipt.products[product.id]=fingerprint({...product,...desired}); await saveReceipt();
        product=await stripe.products.update(product.id,{...desired,tax_code:desired.tax_code||""});
      }
      receipt.products[product.id]=fingerprint(product); await saveReceipt();
      const targetPrices=[];
      for(const interval of ["month","year"]) {
        const src=entry.prices?.find(p=>p.interval===interval);
        const amount=src?.amount??plan[interval], currency=src?.currency??seed.currency;
        const tax_behavior=src?.tax_behavior||"unspecified";
        let price = !deploy && src ? prices.find(p=>p.id===src.id) : prices.find(p=>p.product===product.id && p.active && p.unit_amount===amount && p.currency===currency && p.recurring?.interval===interval && p.recurring.interval_count===1 && p.metadata?.forma_catalog===namespace && (p.tax_behavior||"unspecified")===tax_behavior);
        if(!price) price=await stripe.prices.create({product:product.id,currency,unit_amount:amount,recurring:{interval},tax_behavior:tax_behavior==="unspecified"?undefined:tax_behavior,metadata:{...metadata,forma_source_price:src?.id||"seed"}}, {idempotencyKey:`forma-price-${digest(JSON.stringify([namespace,mode,product.id,amount,currency,interval,tax_behavior]))}`});
        targetPrices.push({id:price.id,interval,amount:price.unit_amount,currency:price.currency});
      }
      await save({[`${prefix(mode)}_PRODUCT_ID_${plan.key.toUpperCase()}`]:product.id});
      if(!product.default_price) await stripe.products.update(product.id,{default_price:targetPrices.find(p=>p.interval==="month").id});
      receipt.initializing[plan.key]=false; delete receipt.productBefore[product.id]; await saveReceipt();
      catalog.push({key:plan.key,name:product.name,description:product.description||"",product_id:product.id,prices:targetPrices});
    }
    const portalFeatures={customer_update:{enabled:true,allowed_updates:["email","address","tax_id"]},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:"at_period_end"},subscription_update:{enabled:true,default_allowed_updates:["price"],proration_behavior:"always_invoice",products:catalog.map(p=>({product:p.product_id,prices:p.prices.map(x=>x.id)})),schedule_at_period_end:{conditions:[{type:"decreasing_item_amount"},{type:"shortening_interval"}]}}};
    const portalHash=digest(JSON.stringify(portalFeatures));
    let portal=portals.find(p=>p.metadata?.forma_catalog===namespace && p.metadata?.forma_revision===portalHash);
    if(portal && !portal.active) throw new Error("Managed portal is inactive. Restore it before retrying.");
    if(!portal) portal=await stripe.billingPortal.configurations.create({name:`${env.APP_NAME} subscriptions`,features:portalFeatures,metadata:{forma_catalog:namespace,forma_revision:portalHash}},{idempotencyKey:`forma-portal-${mode}-${portalHash}`});
    portal=await stripe.billingPortal.configurations.retrieve(portal.id,{expand:["features.subscription_update.products"]});
    if(!contains(portal.features,portalFeatures)) throw new Error("Managed portal features were edited. Reconcile the Stripe portal configuration before continuing; buyer changes are preserved.");
    receipt.portal={id:portal.id,features:featureHash(portal.features)}; await saveReceipt();
    await internal.save({[`${prefix(mode)}_PORTAL_CONFIGURATION_ID`]:portal.id});
    let hook=endpoints.find(e=>e.url===endpointUrl);
    if(!hook) {
      hook=await stripe.webhookEndpoints.create({url:endpointUrl,enabled_events:BILLING_EVENTS,api_version:STRIPE_API_VERSION,metadata:{forma_catalog:namespace}},{idempotencyKey:`forma-webhook-${digest(endpointUrl)}`});
      // Save the one-time secret immediately. A lost response stops on next probe.
      if(!hook.secret) throw new Error("Restore the new webhook secret from Stripe Workbench into .env before retrying.");
      await internal.save({[`${prefix(mode)}_WEBHOOK_ID`]:hook.id,[`${prefix(mode)}_WEBHOOK_SECRET_HASH`]:digest(hook.secret)});
      await save({[`${prefix(mode)}_WEBHOOK_SECRET`]:hook.secret});
    }
    if(hook.status!=="enabled" || hook.api_version!==STRIPE_API_VERSION || BILLING_EVENTS.some(e=>!hook.enabled_events.includes(e))) throw new Error("Managed webhook settings changed. Restore its enabled events/API version in Stripe.");
    await internal.save({[`${prefix(mode)}_WEBHOOK_ID`]:hook.id,[`${prefix(mode)}_FUNCTION_SLUG`]:slug});
    if(!state[`${prefix(mode)}_RECONCILE_SECRET`]) await internal.save({[`${prefix(mode)}_RECONCILE_SECRET`]:randomBytes(32).toString("hex")});
    const values=[env[`${prefix(mode)}_SECRET_KEY`],env[`${prefix(mode)}_WEBHOOK_SECRET`],stripeAccount.id,state[`${prefix(mode)}_RECONCILE_SECRET`],env.SUPABASE_SECRET_KEY];
    const scoped=billingSecretNames(mode).map((name,i)=>({name,value:values[i]}));
    receipt.secrets=Object.fromEntries(scoped.map(s=>[s.name,{before:secrets.find(v=>v.name===s.name)?.value||null,after:digest(s.value)}])); await saveReceipt();
    if(scoped.some(s=>secrets.find(v=>v.name===s.name)?.value!==digest(s.value))) await api.management("/secrets",{method:"POST",body:JSON.stringify(scoped)});
    const actualSecrets=await api.management("/secrets");
    if(scoped.some(s=>actualSecrets.find(v=>v.name===s.name)?.value!==digest(s.value))) throw new Error("Billing secrets could not be verified.");
    if(!functions.some(f=>f.slug===slug)) {
      receipt.function={slug,version:1}; await saveReceipt();
      const body=new FormData(); body.append("metadata",JSON.stringify({entrypoint_path:"index.js",name:slug,verify_jwt:false}));
      body.append("file",new Blob([`const BILLING_MODE = ${JSON.stringify(mode)};\n`+functionSource],{type:"application/javascript"}),"index.js");
      const fn=await api.management(`/functions/deploy?slug=${slug}`,{method:"POST",body});
      if(fn.status!=="ACTIVE" || fn.verify_jwt!==false) throw new Error("Billing function verification failed.");
      receipt.function=functionReceipt(fn); await saveReceipt();
    }
    await api.query(`insert into private.billing_catalog(mode,stripe_account,catalog,portal_configuration_id) values(${sqlString(mode)},${sqlString(stripeAccount.id)},${sqlString(JSON.stringify(catalog))}::jsonb,${sqlString(portal.id)}) on conflict(mode) do update set catalog=excluded.catalog,portal_configuration_id=excluded.portal_configuration_id,updated_at=now() where private.billing_catalog.stripe_account=excluded.stripe_account;`,false);
    const [projection]=await api.query(`select stripe_account,catalog,portal_configuration_id from private.billing_catalog where mode=${sqlString(mode)}`);
    if(projection?.stripe_account!==stripeAccount.id || projection?.portal_configuration_id!==portal.id || JSON.stringify(projection.catalog.map(p=>p.product_id))!==JSON.stringify(catalog.map(p=>p.product_id))) throw new Error("Billing catalog projection target mismatch.");
    await installSchedule(api,mode,`${endpointUrl}/reconcile`,state[`${prefix(mode)}_RECONCILE_SECRET`]);
    // Code revisions get a new content-addressed function and webhook. Disable
    // only our recorded predecessor, after the replacement is fully configured.
    if(receipt.webhook && receipt.webhook.id!==hook.id) {
      const old=endpoints.find(e=>e.id===receipt.webhook.id);
      if(old && old.metadata?.forma_catalog===namespace && old.url===receipt.webhook.url && old.status==="enabled") {
        await stripe.webhookEndpoints.update(old.id,{disabled:true});
      }
    }
    receipt.webhook={id:hook.id,url:endpointUrl};
    await saveReceipt();
  }};
  const protect = run => async () => {
    try { return await run(); }
    catch(error) {
      // Stripe authentication errors can echo a fragment of the supplied key.
      if(error.type?.startsWith("Stripe") || error.rawType || error.raw) throw new Error(`Stripe request failed${Number.isInteger(error.statusCode) ? ` (HTTP ${error.statusCode})` : ""}. Check the selected mode, key permissions and Stripe request logs. Provider response details are intentionally omitted.`);
      throw error;
    }
  };
  return { probe:{...probe,run:protect(probe.run)}, step:{...step,run:protect(step.run)} };
}

function billingSecretNames(mode) { return ["RUNTIME_KEY","WEBHOOK_SECRET","ACCOUNT_ID","RECONCILE_SECRET","SUPABASE_KEY"].map(k=>`FORMA_STRIPE_${mode.toUpperCase()}_${k}`); }
async function installSchedule(api,mode,url,secret) {
  // Schema/functions live in the versioned migration. Store secrets through Vault,
  // never inside cron command text or generated reports.
  await api.query(`select private.configure_billing_schedule(${sqlString(mode)},${sqlString(url)},${sqlString(secret)});`,false);
  const [check]=await api.query(`select count(*)::int as jobs from cron.job where jobname=${sqlString(`forma-billing-${mode}`)} and active`);
  if(check.jobs!==1) throw new Error("Billing reconciliation schedule verification failed.");
}
