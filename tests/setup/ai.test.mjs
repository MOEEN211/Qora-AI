import test from "node:test";
import assert from "node:assert/strict";
import {checkAI} from "../../scripts/kickstart/ai.mjs";
import {boundedContext} from "../../lib/ai/config.mjs";
test("AI disabled performs no provider reads",async()=>{
  await checkAI({},()=>{throw new Error("Unexpected request")});
});
test("AI preflight rejects missing key, depleted limits, and unknown models without generation",async()=>{
  await assert.rejects(checkAI({AI_ENABLED:"true"}),/OPENROUTER_API_KEY/);
  for(const [remaining,model,error] of [[0,"model",/budget/],[10,"missing",/AI_MODEL/]]) {
    const calls=[];
    await assert.rejects(checkAI({AI_ENABLED:"true",OPENROUTER_API_KEY:"fake",AI_MODEL:model},async url=>{
      calls.push(url);return Response.json(url.endsWith('/key')?{data:{limit_remaining:remaining}}:{data:[{id:"model",architecture:{output_modalities:["text"]}}]});
    }),error);
    assert.equal(calls.length,2);assert.ok(calls.every(url=>url.endsWith('/key')||url.endsWith('/models')));
  }
});
test("server context keeps recent complete pairs within the budget",()=>{
  const history=[{prompt:"old",output:"x".repeat(15990)},{prompt:"recent",output:"answer"}];
  assert.deepEqual(boundedContext(history,"new"),[{role:"user",content:"recent"},{role:"assistant",content:"answer"},{role:"user",content:"new"}]);
});
