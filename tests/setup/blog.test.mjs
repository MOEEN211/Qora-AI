import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBlog } from '../../scripts/kickstart/blog.mjs';
test('blog verification rejects missing RLS, public writes, or incomplete installation', async () => {
  const ready = { rls:true, readable:true, readonly:true, policies:1, indexed:true };
  await verifyBlog({query:async()=>[ready]});
  for (const field of Object.keys(ready)) {
    await assert.rejects(verifyBlog({query:async()=>[{...ready,[field]:field==='policies'?0:false}]}), /Blog storage/);
  }
});
