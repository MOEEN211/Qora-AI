import test from 'node:test';
import assert from 'node:assert/strict';
import { emailDeliveryDecision } from '../../lib/email/preferences.mjs';
import { deliverWelcome } from '../../lib/email/welcome.mjs';
import { deliverInvitation } from '../../lib/email/invitation.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'fake-server-key',RESEND_API_KEY:'fake-mail-key',RESEND_FROM_EMAIL:'sender@example.invalid',RESEND_TEMPLATE_WELCOME_ID:'welcome',RESEND_TEMPLATE_WORKSPACE_INVITATION_ID:'invite',APP_URL:'https://example.com'};
const user={id:'user',email:'recipient@example.invalid',email_confirmed_at:'2026-09-14'};
const invitation={email:user.email,send_id:'attempt',token:'secret',workspace:'Test',role:'member',expires_at:'2026-09-21'};
const isGate = url => String(url).endsWith('/rpc/email_notifications_allowed');

test('notification delivery checks fail closed and send only scoped recipient data to Supabase',async()=>{
  let called=false;
  assert.equal(await emailDeliveryDecision(user.email,{},async()=>{called=true;}),'unavailable');
  assert.equal(called,false);
  for(const answer of [null,{},'true'])assert.equal(await emailDeliveryDecision(user.email,env,async()=>Response.json(answer)),'unavailable');
  assert.equal(await emailDeliveryDecision(user.email,env,async()=>{throw Error('offline')}),'unavailable');
  assert.equal(await emailDeliveryDecision(user.email,env,async(url,options)=>{
    assert.ok(isGate(url));assert.equal(options.cache,'no-store');
    assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);
    assert.deepEqual(JSON.parse(options.body),{recipient:user.email,person:user.id});return Response.json(false);
  },user.id),'suppressed');
});
test('disabled email suppresses welcome and invitation without contacting Resend',async()=>{
  let gates=0;
  const fetcher=async url=>{assert.ok(isGate(url));gates++;return Response.json(false)};
  assert.equal(await deliverWelcome(user,env,fetcher),true);
  assert.equal(await deliverInvitation(invitation,env,fetcher),'suppressed');
  assert.equal(gates,2);
});
test('unavailable preferences prevent both application email senders',async()=>{
  const fetcher=async url=>{assert.ok(isGate(url));return new Response(null,{status:503})};
  assert.equal(await deliverWelcome(user,env,fetcher),false);
  assert.equal(await deliverInvitation(invitation,env,fetcher),'unknown');
});
test('both email senders recheck preferences before retry and stop after opt-out',async()=>{
  for(const send of [fetcher=>deliverWelcome(user,env,fetcher),fetcher=>deliverInvitation(invitation,env,fetcher)]) {
    let gates=0,sends=0;
    await send(async(url,options)=>{
      if(isGate(url))return Response.json(++gates===1);
      sends++;assert.equal(options.headers.Authorization,`Bearer ${env.RESEND_API_KEY}`);
      assert.ok(!JSON.stringify(options).includes(env.SUPABASE_SECRET_KEY));return new Response(null,{status:429});
    });
    assert.equal(gates,2);assert.equal(sends,1);
  }
});

test('an opt-out after a lost invitation response preserves uncertain delivery status',async()=>{
  let gates=0,sends=0;
  const result=await deliverInvitation(invitation,env,async url=>{
    if(isGate(url))return Response.json(++gates===1);
    sends++;throw Error('response lost');
  });
  assert.equal(result,'unknown');assert.equal(sends,1);assert.equal(gates,2);
});

import { verifyNotificationPreferences } from '../../scripts/kickstart/notification-preferences.mjs';
test('kickstart rejects missing preference permissions, creation guards, lookup grants or backfill',async()=>{
  const valid={protected:true,triggers:2,lookup:true,backfilled:true};
  await verifyNotificationPreferences({query:async()=>[valid]});
  for(const key of Object.keys(valid))await assert.rejects(verifyNotificationPreferences({query:async()=>[{...valid,[key]:key==='triggers'?1:false}]}),/incomplete/);
});
