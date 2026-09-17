import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { parseEnv } from "node:util";
import Stripe from "stripe";
import { billingMode } from "../../lib/billing/environment.mjs";
import { publicStripeField, compactStripeEnv, stripeState } from "../../scripts/kickstart/stripe-state.mjs";
import { createBillingSetup, selectPrices } from "../../scripts/kickstart/billing.mjs";
import { digest, executeSetup } from "../../scripts/kickstart/core.mjs";
import { summarizeSubscription, syncAccount, startCheckout, withBillingLease, BILLING_EVENTS } from "../../lib/billing/engine.mjs";

function iterable(items) { return { async *[Symbol.asyncIterator]() { yield* structuredClone(items); } }; }
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),"forma-billing-test-"));
  for(const file of ["config/billing-seed.json","lib/billing/engine.mjs","supabase/functions/stripe-billing/index.js"]) {
    await mkdir(dirname(join(root,file)),{recursive:true}); await cp(new URL(`../../${file}`,import.meta.url),join(root,file));
  }
  const env={APP_NAME:"Forma",APP_URL:"http://localhost:3000",SUPABASE_PROJECT_REF:"abcdefghijklmnopqrst",NEXT_PUBLIC_SUPABASE_URL:"https://abcdefghijklmnopqrst.supabase.co",SUPABASE_SECRET_KEY:"sb_secret_fake",STRIPE_TEST_SECRET_KEY:"sk_test_fake",STRIPE_LIVE_SECRET_KEY:"sk_live_fake"};
  await writeFile(join(root,".env"),Object.entries(env).map(([k,v])=>`${k}=${v}`).join("\n"));
  const modes={test:{products:[],prices:[],webhooks:[],portals:[]},live:{products:[],prices:[],webhooks:[],portals:[]}};
  const remote={secrets:[],functions:[],catalog:{},writes:[],losePrice:false};
  const factory=key=>{
    const mode=key.includes("_live_")?"live":"test",state=modes[mode];
    const create=(kind,args)=>{remote.writes.push(`${mode}:${kind}`);const p={id:args.id||`${kind}_${state[kind].length+1}`,active:true,livemode:mode==="live",...structuredClone(args)};state[kind].push(p);return p;};
    return {
      accounts:{retrieve:async()=>({id:"acct_fake",charges_enabled:true})},
      products:{list:()=>iterable(state.products),create:async a=>create("products",a),update:async(id,a)=>{remote.writes.push(`${mode}:update`);Object.assign(state.products.find(p=>p.id===id),a);return state.products.find(p=>p.id===id);}},
      prices:{list:()=>iterable(state.prices),create:async a=>{const p=create("prices",{...a,tax_behavior:a.tax_behavior||"unspecified",billing_scheme:"per_unit",recurring:{...a.recurring,interval_count:1,usage_type:"licensed"}});if(remote.losePrice){remote.losePrice=false;throw new Error("lost price response");}return p;}},
      webhookEndpoints:{list:()=>iterable(state.webhooks),create:async a=>create("webhooks",{...a,status:"enabled",secret:"whsec_fake"})},
      billingPortal:{configurations:{
        list:params=>{assert.deepEqual(params.expand,["data.features.subscription_update.products"]);return iterable(state.portals);},
        create:async a=>{const p=create("portals",a);const response=structuredClone(p);delete response.features.subscription_update.products;return response;},
        retrieve:async(id,params)=>{assert.deepEqual(params.expand,["features.subscription_update.products"]);return structuredClone(state.portals.find(p=>p.id===id));},
      }},
      customers:{list:async()=>({data:[]})},subscriptions:{list:async()=>({data:[]})},checkout:{sessions:{list:async()=>({data:[]})}},
    };
  };
  const api={
    management:async(path,opts)=>{
      if(path==="/functions") return structuredClone(remote.functions);
      if(path==="/secrets" && !opts)return structuredClone(remote.secrets);
      if(path==="/secrets") {remote.writes.push("secrets");for(const s of JSON.parse(opts.body)){const entry={name:s.name,value:digest(s.value)};const i=remote.secrets.findIndex(e=>e.name===s.name);if(i<0)remote.secrets.push(entry);else remote.secrets[i]=entry;}return null;}
      if(path.startsWith("/functions/deploy")){remote.writes.push("function");const slug=new URL(`https://example.com${path}`).searchParams.get("slug");const f={slug,version:1,verify_jwt:false,status:"ACTIVE"};remote.functions.push(f);return f;}
      throw new Error(`Unexpected path ${path}`);
    },
    query:async(sql,readonly=true)=>{
      if(sql.includes("pg_available_extensions"))return [{available:3}];
      if(sql.includes("to_regclass('private.billing_catalog')"))return [{installed:Object.keys(remote.catalog).length>0}];
      if(sql.startsWith("select stripe_account from")){const mode=sql.match(/mode='([^']+)'/)[1];return remote.catalog[mode]?[{stripe_account:remote.catalog[mode].stripe_account}]:[];}
      if(sql.startsWith("insert into private.billing_catalog")){remote.writes.push("catalog");const m=sql.match(/values\('([^']+)','([^']+)','(.*?)'::jsonb,'([^']+)'\)/s);remote.catalog[m[1]]={stripe_account:m[2],catalog:JSON.parse(m[3].replaceAll("''","'")),portal_configuration_id:m[4]};return [];}
      if(sql.startsWith("select stripe_account,catalog")){const mode=sql.match(/mode='([^']+)'/)[1];return [remote.catalog[mode]];}
      if(sql.includes("configure_billing_schedule")){assert.equal(readonly,false);remote.writes.push("schedule");return [];}
      if(sql.includes("cron.job"))return [{jobs:1}];
      throw new Error("Unexpected SQL");
    },
  };
  const sourceProjectRef=env.SUPABASE_PROJECT_REF;
  const setup=async(deploy=false)=>createBillingSetup({root,env,api,deploy,sourceProjectRef,stripeFactory:factory});
  const cleanup=async()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith("forma-billing-test-"));await rm(root,{recursive:true,force:true});};
  return {root,env,modes,remote,setup,cleanup};
}

test("test setup creates three products/six prices, preserves edits, saves only test identifiers and safely reruns",async()=>{
  const f=await fixture();try{
    let setup=await f.setup();await setup.probe.run();assert.equal(f.remote.writes.length,0);await setup.step.run();
    assert.equal(f.modes.test.products.length,3);assert.equal(f.modes.test.prices.length,6);assert.equal(f.modes.test.webhooks.length,1);assert.equal(f.modes.test.portals.length,1);
    assert.equal(f.modes.live.products.length,0);
    const env=parseEnv(await readFile(join(f.root,".env"),"utf8"));assert.ok(env.STRIPE_TEST_WEBHOOK_SECRET);assert.ok(env.STRIPE_TEST_PRODUCT_ID_PRO);assert.equal(env.STRIPE_TEST_PRICE_PRO_YEAR,undefined);assert.ok(Object.keys(env).filter(k=>k.startsWith("STRIPE_")).every(publicStripeField));assert.ok(f.remote.catalog.test.portal_configuration_id);assert.equal(env.STRIPE_LIVE_PRODUCT_ID_PRO,undefined);
    f.modes.test.products[0].name="Launch";
    setup=await f.setup();await setup.probe.run();await setup.step.run();
    assert.equal(f.modes.test.products[0].name,"Launch");assert.equal(f.modes.test.products.length,3);assert.equal(f.modes.test.prices.length,6);assert.equal(f.modes.test.webhooks.length,1);assert.equal(f.modes.test.portals.length,1);
    assert.equal(f.remote.catalog.test.catalog[0].name,"Launch");
    assert.ok(f.remote.secrets.every(s=>!s.name.includes("API_KEY")&&!s.name.includes("ACCESS_TOKEN")));
  }finally{await f.cleanup();}
});
test("partial price creation resumes from provider state without duplicate resources",async()=>{
  const f=await fixture();try{
    f.remote.losePrice=true;let setup=await f.setup();await setup.probe.run();await assert.rejects(setup.step.run(),/lost price/);
    setup=await f.setup();await setup.probe.run();await setup.step.run();assert.equal(f.modes.test.products.length,3);assert.equal(f.modes.test.prices.length,6);
  }finally{await f.cleanup();}
});
test("live promotion shares the hosted project, reads the edited test catalog and preserves test IDs",async()=>{
  const f=await fixture();try{
    let setup=await f.setup();await setup.probe.run();await setup.step.run();
    const testIds=f.modes.test.products.map(p=>p.id);
    f.modes.test.products[0].name="Launch";f.modes.test.prices[0].unit_amount=2300;
    f.env.APP_URL=f.env.APP_URL_LIVE="https://example.com";
    setup=await f.setup(true);await setup.probe.run();await setup.step.run();
    assert.equal(f.modes.live.products[0].name,"Launch");assert.equal(f.modes.live.prices[0].unit_amount,2300);
    assert.deepEqual(f.modes.test.products.map(p=>p.id),testIds);assert.equal(f.modes.live.webhooks.length,1);
    setup=await f.setup(true);await setup.probe.run();await setup.step.run();assert.equal(f.modes.live.prices.length,6);
    const env=parseEnv(await readFile(join(f.root,".env"),"utf8"));
    assert.ok(Object.keys(env).filter(k=>k.startsWith("STRIPE_")).every(publicStripeField));
    assert.ok(f.remote.catalog.live.portal_configuration_id);
    assert.equal(f.modes.live.products[0].metadata.forma_catalog,f.modes.test.products[0].metadata.forma_catalog);
    f.modes.live.products[0].name="Buyer edited live";
    setup=await f.setup(true);await assert.rejects(setup.probe.run(),/outside kickstart/);
  }finally{await f.cleanup();}
});
test("bad keys and missing webhook secret stop preflight with zero further writes",async()=>{
  const f=await fixture();try{
    f.env.STRIPE_TEST_SECRET_KEY="rk_live_wrong";let setup=await f.setup();await assert.rejects(setup.probe.run(),/TEST_SECRET_KEY/);assert.equal(f.remote.writes.length,0);
    f.env.STRIPE_TEST_SECRET_KEY="rk_test_setup";setup=await f.setup();await setup.probe.run();await setup.step.run();const count=f.remote.writes.length;
    f.env.STRIPE_TEST_WEBHOOK_SECRET="whsec_previous_endpoint";setup=await f.setup();await assert.rejects(setup.probe.run(),/Restore STRIPE_TEST_WEBHOOK_SECRET/);assert.equal(f.remote.writes.length,count);
    delete f.env.STRIPE_TEST_WEBHOOK_SECRET;setup=await f.setup();await assert.rejects(setup.probe.run(),/Restore STRIPE_TEST_WEBHOOK_SECRET/);assert.equal(f.remote.writes.length,count);
  }finally{await f.cleanup();}
});
test("ambiguous prices fail instead of guessing which buyer price should be sold",()=>{
  const p={id:"prod",name:"Starter"};const price={id:"price",active:true,product:"prod",unit_amount:1900,currency:"usd",billing_scheme:"per_unit",recurring:{interval:"month",interval_count:1,usage_type:"licensed"}};
  assert.throws(()=>selectPrices(p,[price,{...price,id:"other"}]),/exactly one/);
});
test("global preflight includes Stripe and never provisions after another required service fails",async()=>{
  const f=await fixture();try{
    const setup=await f.setup();const env={...f.env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fake",SUPABASE_ACCESS_TOKEN:"fake",RESEND_API_KEY:"fake",RESEND_FROM_EMAIL:"a@example.com"};
    const result=await executeSetup({env,probes:[setup.probe,{name:"Resend",run:async()=>{throw new Error("Invalid key");}}],steps:[setup.step]});
    assert.equal(result.status,"blocked");assert.equal(f.remote.writes.length,0);
  }finally{await f.cleanup();}
});

const catalog=[{key:"starter",name:"Starter",product_id:"prod"}];
const subscription=(status="active")=>({id:"sub",created:100,status,cancel_at_period_end:false,items:{data:[{quantity:1,current_period_end:200,price:{id:"price",product:"prod",unit_amount:1900,currency:"usd",recurring:{interval:"month"}}}]}});
test("subscription states grant paid access only to supported active/trialing subscriptions",()=>{
  for(const status of ["active","trialing"])assert.equal(summarizeSubscription([subscription(status)],catalog).paid,true);
  for(const status of ["past_due","unpaid","paused","incomplete","canceled","incomplete_expired"])assert.equal(summarizeSubscription([subscription(status)],catalog).paid,false);
  assert.equal(summarizeSubscription([subscription()],[]).paid,false);
  assert.throws(()=>summarizeSubscription([subscription(),{...subscription(),id:"sub2"}],catalog),/Multiple/);
});
test("old/replayed webhook events refresh current Stripe state and rebuild a missing cache",async()=>{
  let snapshot;const rpc=async(op,p)=>{assert.equal(op,"commit");snapshot=p.snapshot;};
  const stripe={subscriptions:{list:()=>iterable([subscription("canceled")])}};
  for(const eventId of ["evt_new","evt_old","evt_old"])await syncAccount({stripe,rpc,account:{id:"account",customer_id:"cus"},token:"token",catalog,eventId});
  assert.equal(snapshot.status,"canceled");assert.equal(snapshot.paid,false);
});
test("billing leases deny overlapping work and release after provider errors",async()=>{
  let released=false;const rpc=async op=>op==="claim"?{account:{id:"a"},token:"t"}:(released=true);
  await assert.rejects(withBillingLease(rpc,{},async()=>{throw new Error("provider failure");}),/provider failure/);assert.equal(released,true);
  await assert.rejects(withBillingLease(async()=>null,{},async()=>assert.fail()),/busy/);
});
test("Checkout reuses a durable attempt across competing plan selections",async()=>{
  const sent=[];const attempt={id:"same",price_id:"first_price",app_url:"https://example.com",expires_at:2000000000};
  const rpc=async op=>op==="claim"?{account:{id:"a",customer_id:"cus"},token:"t"}:op==="checkout_attempt"?attempt:null;
  const stripe={subscriptions:{list:()=>iterable([])},checkout:{sessions:{create:async(body,options)=>{sent.push({body,options});return{status:"open",url:"https://checkout.stripe.com/test",id:"cs"};}}}};
  for(const price of [{id:"first_price"},{id:"second_price"}])await startCheckout({stripe,rpc,user:{id:"u"},mode:"test",stripeAccount:"acct",price,catalog,appUrl:"https://example.com"});
  assert.deepEqual(sent[0],sent[1]);assert.equal(sent[0].body.line_items[0].quantity,1);assert.equal(sent[0].body.payment_method_types,undefined);
});

test("hosted webhook rejects unsigned, tampered and wrong-mode events without touching billing",async()=>{
  let serve;let databaseCalls=0;
  const source=await readFile(new URL("../../supabase/functions/stripe-billing/index.js",import.meta.url),"utf8");
  const injected=source.replace(/^import .*;\r?\n/gm,"");
  const Deno={env:{get:key=>key.endsWith("WEBHOOK_SECRET")?"whsec_test":key.endsWith("RUNTIME_KEY")?"sk_test_fake":key.endsWith("ACCOUNT_ID")?"acct_fake":"fake"},serve:handler=>{serve=handler;}};
  new Function("Stripe","Deno","BILLING_MODE","STRIPE_API_VERSION","BILLING_EVENTS","syncAccount","withBillingLease","fetch",injected)(Stripe,Deno,"test","2026-08-26.dahlia",BILLING_EVENTS,syncAccount,withBillingLease,async()=>{databaseCalls++;throw new Error("must not call");});
  const signer=new Stripe("sk_test_fake");
  const payload=JSON.stringify({id:"evt",livemode:true,type:"customer.subscription.updated",data:{object:{customer:"cus"}}});
  const header=signer.webhooks.generateTestHeaderString({payload,secret:"whsec_test"});
  assert.equal((await serve(new Request("https://example.com/webhook",{method:"POST",body:payload}))).status,400);
  assert.equal((await serve(new Request("https://example.com/webhook",{method:"POST",body:payload+" ",headers:{"stripe-signature":header}}))).status,400);
  assert.equal((await serve(new Request("https://example.com/webhook",{method:"POST",body:payload,headers:{"stripe-signature":header}}))).status,400);
  assert.equal(databaseCalls,0);
});

test("a valid signed hosted webhook fetches current subscription state and commits before acknowledging",async()=>{
  let serve;const calls=[];
  const source=(await readFile(new URL("../../supabase/functions/stripe-billing/index.js",import.meta.url),"utf8")).replace(/^import .*;\r?\n/gm,"");
  class TestStripe extends Stripe {
    constructor(...args){super(...args);this.subscriptions.list=()=>iterable([subscription()]);}
  }
  const Deno={env:{get:key=>key.endsWith("WEBHOOK_SECRET")?"whsec_test":key.endsWith("RUNTIME_KEY")?"sk_test_fake":key.endsWith("ACCOUNT_ID")?"acct_fake":"https://example.com"},serve:handler=>{serve=handler;}};
  const fetcher=async(_url,options)=>{
    const {operation,payload}=JSON.parse(options.body);calls.push({operation,payload});
    const values={lookup:{id:"account",customer_id:"cus"},catalog:{stripe_account:"acct_fake",catalog},claim:{account:{id:"account",customer_id:"cus"},token:"token"}};
    return new Response(JSON.stringify(values[operation]||null),{status:200});
  };
  new Function("Stripe","Deno","BILLING_MODE","STRIPE_API_VERSION","BILLING_EVENTS","syncAccount","withBillingLease","fetch",source)(TestStripe,Deno,"test","2026-08-26.dahlia",BILLING_EVENTS,syncAccount,withBillingLease,fetcher);
  const payload=JSON.stringify({id:"evt_valid",livemode:false,type:"invoice.payment_failed",data:{object:{customer:"cus"}}});
  const signature=new Stripe("sk_test_fake").webhooks.generateTestHeaderString({payload,secret:"whsec_test"});
  const response=await serve(new Request("https://example.com/webhook",{method:"POST",body:payload,headers:{"stripe-signature":signature}}));
  assert.equal(response.status,200);
  assert.deepEqual(calls.map(c=>c.operation),["lookup","catalog","claim","commit","release"]);
  assert.equal(calls[3].payload.snapshot.status,"active"); // Current API state wins over an old failed-payment event.
  assert.equal(calls[3].payload.event_id,"evt_valid");
});


test("Stripe environment upgrade preserves credentials and internal recovery state across retries",async()=>{
  const f=await fixture();try{
    const original=await readFile(join(f.root,".env"),"utf8");
    await writeFile(join(f.root,".env"), original+'\nSTRIPE_TEST_PRICE_PRO_YEAR=price_old\nSTRIPE_TEST_WEBHOOK_ID=we_old\nSTRIPE_TEST_RECONCILE_SECRET=private_token\nSTRIPE_TEST_WEBHOOK_SECRET=whsec_keep\nSTRIPE_TEST_PRODUCT_ID_PRO=prod_keep\n');
    await compactStripeEnv(f.root);
    const first=await readFile(join(f.root,".env"),"utf8");
    const env=parseEnv(first);
    assert.ok(Object.keys(env).filter(k=>k.startsWith("STRIPE_")).every(publicStripeField));
    for(const [key,value] of Object.entries(f.env)) assert.equal(env[key],value);
    assert.equal(env.STRIPE_TEST_WEBHOOK_SECRET,"whsec_keep");
    assert.equal(env.STRIPE_TEST_PRODUCT_ID_PRO,"prod_keep");
    const state=await stripeState(f.root,f.env.SUPABASE_PROJECT_REF);
    assert.equal(state.values.STRIPE_TEST_WEBHOOK_ID,"we_old");
    assert.equal(state.values.STRIPE_TEST_RECONCILE_SECRET,"private_token");
    await compactStripeEnv(f.root);
    assert.equal(await readFile(join(f.root,".env"),"utf8"),first);
    assert.equal(f.remote.writes.length,0);
  }finally{await f.cleanup();}
});

test("billing mode follows secret keys and never NODE_ENV",()=>{
  assert.equal(billingMode({}),"test");
  assert.equal(billingMode({NODE_ENV:"production"}),"test");
  assert.equal(billingMode({STRIPE_TEST_SECRET_KEY:"rk_test_runtime",STRIPE_LIVE_SECRET_KEY:"rk_live_runtime"}),"test");
  assert.equal(billingMode({STRIPE_LIVE_SECRET_KEY:"rk_live_runtime"}),"live");
});
