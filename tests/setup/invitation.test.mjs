import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliverInvitation as sendInvitation} from '../../lib/email/invitation.mjs';
const deliverInvitation = (invitation,env,fetcher) => sendInvitation(invitation,
  {...env,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'fake-server-key'},
  (url,options)=>String(url).endsWith('/rpc/email_notifications_allowed') ? Promise.resolve(Response.json(true)) : fetcher(url,options));
const env={RESEND_API_KEY:'test',RESEND_TEMPLATE_WORKSPACE_INVITATION_ID:'template',RESEND_FROM_EMAIL:'hello@example.com',APP_URL:'https://example.com'};
const invitation={email:'person@example.com',token:'a'.repeat(64),send_id:'one',workspace:'<script>bad</script>',inviter:'Alex & Co',role:'member',expires_at:'2026-09-21T00:00:00Z'};
test('invitation sends escaped variables using the authoritative URL and stable attempt id',async()=>{
  const calls=[];
  const result=await deliverInvitation(invitation,env,async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'sent'}),{status:200})});
  assert.equal(result,'accepted');const body=JSON.parse(calls[0].options.body);
  assert.equal(body.template.variables.ROLE,'Member');
  assert.equal(body.template.variables.WORKSPACE,'&lt;script&gt;bad&lt;/script&gt;');
  assert.equal(body.template.variables.ACTION_URL,`https://example.com/invite#token=${invitation.token}`);
  assert.equal(calls[0].options.headers['Idempotency-Key'],'workspace-invite-one');
});
test('invitation permanent rejection is distinct from unknown send status',async()=>{
  assert.equal(await deliverInvitation(invitation,env,async()=>new Response('{}',{status:403})),'failed');
  assert.equal(await deliverInvitation(invitation,env,async()=>new Response('{}',{status:200})),'unknown');
});
test('a transient invitation retry keeps the same idempotency key',async()=>{
  const keys=[];let count=0;
  const result=await deliverInvitation(invitation,env,async(_,options)=>{keys.push(options.headers['Idempotency-Key']);if(count++===0)throw new Error('lost response');return new Response('{"id":"sent"}',{status:200})});
  assert.equal(result,'accepted');assert.deepEqual(keys,['workspace-invite-one','workspace-invite-one']);
});

test('Admin invitation uses the published template with its stored role',async()=>{
  let body;
  const result=await deliverInvitation({...invitation,role:'admin'},env,async(_,options)=>{body=JSON.parse(options.body);return Response.json({id:'sent'});});
  assert.equal(result,'accepted');
  assert.equal(body.template.id,env.RESEND_TEMPLATE_WORKSPACE_INVITATION_ID);
  assert.equal(body.template.variables.ROLE,'Admin');
});
