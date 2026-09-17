import Stripe from "npm:stripe@22.6.2";
import { STRIPE_API_VERSION, BILLING_EVENTS, syncAccount, withBillingLease } from "../../../lib/billing/engine.mjs";

// Kickstart prepends BILLING_MODE and inlines the shared module for one-file deployment.
const prefix = `FORMA_STRIPE_${BILLING_MODE.toUpperCase()}`;
const stripe = new Stripe(Deno.env.get(`${prefix}_RUNTIME_KEY`), { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 15000 });
const stripeAccount = Deno.env.get(`${prefix}_ACCOUNT_ID`);
const supabaseKey = Deno.env.get(`${prefix}_SUPABASE_KEY`);
async function rpc(operation, payload) {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/billing_admin`, {
    method: "POST", headers: { "Content-Type":"application/json", apikey:supabaseKey, Authorization:`Bearer ${supabaseKey}` },
    body: JSON.stringify({operation,payload}), signal:AbortSignal.timeout(15000),
  });
  if(!response.ok) throw new Error("Billing database request failed");
  return response.json();
}
const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function secretMatches(actual, expected) {
  if(!actual || !expected) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(expected),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(expected));
  return crypto.subtle.verify("HMAC",key,signature,new TextEncoder().encode(actual));
}
Deno.serve(async request=>{
  if(request.method!=="POST") return json({error:"Method not allowed"},405);
  try {
    if(new URL(request.url).pathname.endsWith("/reconcile")) {
      if(!await secretMatches(request.headers.get("authorization"),`Bearer ${Deno.env.get(`${prefix}_RECONCILE_SECRET`)}`)) return json({error:"Unauthorized"},401);
      const config=await rpc("catalog",{mode:BILLING_MODE});
      if(!config || config.stripe_account!==stripeAccount) return json({error:"Billing unavailable"},503);
      const accounts=await rpc("pending",{mode:BILLING_MODE});
      let failed=0,completed=0;
      for(const account of accounts) {
        try { await withBillingLease(rpc,{id:account.id},(a,token)=>syncAccount({stripe,rpc,account:a,token,catalog:config.catalog})); completed++; }
        catch { failed++; }
      }
      return json({completed,failed},failed?503:200);
    }
    // Bound untrusted input before signature verification.
    if(Number(request.headers.get("content-length"))>1024*1024) return json({error:"Too large"},413);
    const reader=request.body?.getReader(); if(!reader) return json({error:"Missing body"},400);
    const chunks=[]; let size=0;
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>1024*1024){await reader.cancel();return json({error:"Too large"},413);} chunks.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let event;
    try { event=await stripe.webhooks.constructEventAsync(new TextDecoder().decode(bytes),request.headers.get("stripe-signature"),Deno.env.get(`${prefix}_WEBHOOK_SECRET`),300,Stripe.createSubtleCryptoProvider()); }
    catch { return json({error:"Invalid signature"},400); }
    if(event.livemode!==(BILLING_MODE==="live") || event.account) return json({error:"Wrong Stripe context"},400);
    if(!BILLING_EVENTS.includes(event.type)) return json({received:true});
    const object=event.data.object;
    const customer=typeof object.customer==="string"?object.customer:object.customer?.id;
    if(!customer) return json({received:true});
    const account=await rpc("lookup",{mode:BILLING_MODE,stripe_account:stripeAccount,customer_id:customer});
    if(!account) return json({received:true}); // Other applications' customers never enter this app.
    const config=await rpc("catalog",{mode:BILLING_MODE});
    if(!config || config.stripe_account!==stripeAccount) return json({error:"Billing unavailable"},503);
    // Always fetch current Stripe state under the account lease. Event delivery
    // time/order is never treated as the authoritative subscription state.
    await withBillingLease(rpc,{id:account.id},(a,token)=>syncAccount({stripe,rpc,account:a,token,catalog:config.catalog,eventId:event.id}));
    return json({received:true});
  } catch { return json({error:"Billing temporarily unavailable; retry delivery"},503); }
});
