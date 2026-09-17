// Install the optional AI module into an existing kickstart-managed application.
// Stripe is not required for this scope. Core provisioning remains in index.mjs.
import {readFile,readdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi,digest,executeSetup,migrationQuery} from './core.mjs';
import {checkAI,verifyAI} from './ai.mjs';
import {saveGeneratedEnv} from './env-file.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
if(args.some(a=>a!=='--check')) throw new Error('Usage: npm run kickstart:ai [-- --check]');
const env={...process.env,...parseEnv(await readFile(resolve(root,'.env'),'utf8')),AI_ENABLED:'true'};
const api=createApi(env);
const files=(await readdir(resolve(root,'supabase/migrations'))).filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort();
const migrations=await Promise.all(files.map(async name=>({name,sql:await readFile(resolve(root,'supabase/migrations',name),'utf8')})));
const selected=migrations.filter(m=>/_workspace_ai(?:_[a-z_]+)?\.sql$/.test(m.name));
const probes=[
  {name:'OpenRouter key and model',run:()=>checkAI(env)},
  {name:'Hosted project identity',run:async()=>{
    const project=await api.management('');
    if(project.id!==env.SUPABASE_PROJECT_REF || project.status!=='ACTIVE_HEALTHY') throw new Error('Configured hosted project identity or health did not match.');
    const receipt=JSON.parse(await readFile(resolve(root,'.kickstart',`${env.SUPABASE_PROJECT_REF}.json`),'utf8'));
    if(receipt.project!==env.SUPABASE_PROJECT_REF) throw new Error('Restore the matching kickstart receipt.');
  }},
  {name:'Supabase publishable key',run:()=>api.authSettings()},
  {name:'Supabase server key',run:()=>api.checkServerKey()},
  {name:'Installed core and migration checksums',run:async()=>{
    const rows=await api.query('select version,checksum from private.kickstart_migrations');
    for(const row of rows){
      const source=migrations.find(m=>m.name===row.version);
      if(!source || digest(source.sql)!==row.checksum) throw new Error('Restore migrations matching the installed checksum ledger before continuing.');
    }
    const [core]=await api.query("select to_regclass('public.organizations') is not null and to_regclass('public.organization_members') is not null and to_regprocedure('private.is_verified_user()') is not null as ready");
    if(!rows.length || !core.ready || selected.length<1) throw new Error('Install the core application with kickstart before installing AI.');
  }},
];
const steps=[
  ...selected.map(m=>({name:`Migration ${m.name}`,run:()=>api.query(migrationQuery(m.name,m.sql),false)})),
  {name:'Verify AI storage, grants and recovery',run:()=>verifyAI(api)},
  {name:'Enable AI in the local environment',run:()=>saveGeneratedEnv(resolve(root,'.env'),{AI_ENABLED:'true'})},
];
console.log('AI-only installation: all required read-only checks run before writes. No Stripe provisioning or billable generation.');
const result=await executeSetup({env,probes,steps,checkOnly:args.includes('--check'),log:item=>console.log(`${item.ok?'PASS':'FAIL'} ${item.name}${item.message?`: ${item.message}`:''}`)});
if(['blocked','partial'].includes(result.status)){
  console.error(result.status==='blocked'?'Preflight failed. No provisioning changes made.':`Stopped at ${result.failed}. Completed steps are retained; rerun safely after fixing the error.`);
  process.exitCode=1;
}else console.log(result.status==='checked'?'AI preflight passed. No changes made.':'AI installed and enabled. Existing and new workspaces receive one initial balance. Restart the app; verify streaming separately.');
