import test from 'node:test';
import assert from 'node:assert/strict';
import { emailSql } from '../../scripts/admin/target.mjs';
import { verifyAdmin } from '../../scripts/kickstart/admin.mjs';
import { subscriptionReporting } from '../../lib/billing/engine.mjs';
test('operator command encodes email as data, including SQL metacharacters',()=>{
 const sql=emailSql("O'Name+select@example.com");
 assert.match(sql,/^convert_from\(decode\('[0-9a-f]+','hex'\),'UTF8'\)$/);
 assert.ok(!sql.includes("O'Name"));assert.throws(()=>emailSql('bad'));assert.throws(()=>emailSql('x'.repeat(256)));
});
test('admin verification rejects missing authorization guards',async()=>{
 await assert.rejects(verifyAdmin({query:async()=>[{ready:false}]}),/incomplete/);
});
const sub=(status='active',interval='month',amount=1900,discounts=[])=>({status,discounts,items:{data:[{quantity:1,price:{unit_amount:amount,currency:'usd',product:'prod_example',recurring:{interval,interval_count:1}}}]}});
test('MRR normalizes existing annual prices, includes payment retries, and excludes churn/trials',()=>{
 assert.equal(subscriptionReporting(sub(),true).mrr_minor,1900);
 assert.equal(subscriptionReporting(sub('active','year',19000),true).mrr_minor,19000/12);
 assert.equal(subscriptionReporting(sub('past_due'),true).subscriber,true);
 for(const status of ['trialing','unpaid','canceled','paused','incomplete']) assert.equal(subscriptionReporting(sub(status),true).mrr_minor,0);
 assert.equal(subscriptionReporting(sub('unpaid'),true).churned,true);
 assert.equal(subscriptionReporting(sub('paused'),true).churned,false);
});
test('MRR applies recurring discounts and distinguishes unknown discounts from zero revenue',()=>{
 const discount={start:0,end:null,source:{coupon:{duration:'forever',percent_off:25}}};
 assert.equal(subscriptionReporting(sub('active','month',1900,[discount]),true).mrr_minor,1425);
 assert.equal(subscriptionReporting(sub('active','month',1900,[{...discount,source:{coupon:{duration:'once',percent_off:25}}}]),true).mrr_minor,1900);
 assert.equal(subscriptionReporting(sub('active','month',1900,['di_unexpanded']),true).known,false);
 assert.equal(subscriptionReporting(sub(),false).mrr_minor,null);
 const free=subscriptionReporting(sub('active','month',1900,[{...discount,source:{coupon:{duration:'forever',percent_off:100}}}]),true);
 assert.equal(free.mrr_minor,0);assert.equal(free.subscriber,true);assert.equal(free.churned,false);
});
