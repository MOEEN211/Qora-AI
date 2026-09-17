import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createApi} from '../../scripts/kickstart/core.mjs';
export async function aiFixture() {
  const env=parseEnv(await readFile(new URL('../../.env',import.meta.url),'utf8'));
  if(env.HOSTED_TEST_PROJECT_REF!==env.SUPABASE_PROJECT_REF) throw new Error('Explicitly configure the authorized hosted test target.');
  const api=createApi(env);
  const [installed]=await api.query("select to_regclass('private.ai_generations') is not null as ai");
  if(!installed.ai) throw new Error('Install AI through kickstart before the live fixture checks.');
  const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=`ai-test-${randomUUID()}@example.invalid`,password=`Ai-${randomUUID()}!`;
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'AI Test'}});
  if(result.error || !result.data.user) throw new Error('AI fixture user creation failed.');
  const userId=result.data.user.id;
  let orgId;
  const cleanup=async()=>{
    const removed=await admin.auth.admin.deleteUser(userId);
    if(removed.error) throw new Error('AI fixture cleanup failed.');
  };
  try {
    const {data,error}=await admin.from('organization_members').select('org_id').eq('user_id',userId).single();
    if(error) throw new Error('AI fixture workspace unavailable.');
    orgId=data.org_id;
    const user=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await user.auth.signInWithPassword({email,password});if(signed.error)throw new Error('AI fixture login failed.');
    return {env,api,admin,user,userId,orgId,email,password,cleanup};
  } catch(e) {await cleanup();throw e;}
}
