import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {aiFixture} from '../tests/helpers/ai-fixture.mjs';
const f=await aiFixture();
try {
  const chats=Array.from({length:8},()=>randomUUID());
  for(const id of chats) {
    const r=await f.user.rpc('ai_history',{target:f.orgId,operation:'create',payload:{id}});assert.equal(r.error,null);
  }
  await f.user.rpc('ai_history',{target:f.orgId,operation:'credits',payload:{mode:'test'}});
  await f.api.query(`update private.ai_credit_accounts set consumed=allowance-1 where org_id='${f.orgId}'::uuid`,false);
  const attempts=chats.map(chat_id=>({id:randomUUID(),org_id:f.orgId,user_id:f.userId,chat_id,prompt:'Concurrent fixture',model:'fixture',mode:'test'}));
  const results=await Promise.all(attempts.map(payload=>f.admin.rpc('ai_run',{operation:'reserve',payload})));
  assert.equal(results.filter(r=>!r.error).length,1,'Exactly one request can reserve the final credit');
  const winner=results.findIndex(r=>!r.error),claim=results[winner].data;
  const payload={id:attempts[winner].id,lease:claim.lease,status:'completed',output:'Completed fixture'};
  const settlements=await Promise.all(Array.from({length:8},()=>f.admin.rpc('ai_run',{operation:'settle',payload})));
  assert.ok(settlements.every(r=>!r.error));
  const balance=await f.user.rpc('ai_history',{target:f.orgId,operation:'credits',payload:{mode:'test'}});
  assert.equal(balance.data.available,0);assert.equal(balance.data.reserved,0);assert.equal(balance.data.consumed,balance.data.allowance);
  const [counts]=await f.api.query(`select sum(credits_charged)::integer as charged,count(*)::integer as requests from private.ai_generations where org_id='${f.orgId}'::uuid`);
  assert.deepEqual(counts,{charged:1,requests:1});
  console.log('Eight concurrent hosted reservations at the final credit admitted exactly one request; eight settlements charged once. No provider generation or Stripe payment was made.');
} finally {await f.cleanup();console.log('AI concurrency fixture removed.');}
