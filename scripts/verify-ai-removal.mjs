// Source-removal build in a secret-free temporary copy. Never modifies dependencies
// in the working application; the junction is used only to resolve installed tools.
import {mkdtemp,cp,readFile,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const target=await mkdtemp(join(tmpdir(),'forma-ai-removal-'));
const excluded=new Set(['node_modules','.next','.git','.kickstart','.secrets','.vercel','.dev.vars','.source','artifacts','test-results','playwright-report']);
const aiPaths=['app/api/ai','app/dashboard/chat','app/preview/chat','components/ai','lib/ai'];
await cp(root,target,{recursive:true,filter:source=>{
  const path=relative(root,source).replaceAll('\\','/');const first=path.split('/')[0];
  if(excluded.has(first)||first.startsWith('.env')||path==='supabase/.temp'||path.startsWith('supabase/.temp/'))return false;
  if(aiPaths.some(p=>path===p||path.startsWith(p+'/')))return false;
  if(/^(scripts|tests\/setup|tests\/e2e|tests\/helpers)\/.*ai[.-]/.test(path))return false;
  if(path==='scripts/kickstart/ai.mjs')return false;
  return true;
}});
const edit=async(path,change)=>writeFile(join(target,path),change(await readFile(join(target,path),'utf8')));
await edit('scripts/kickstart/index.mjs',s=>s.replace(/^import \{ checkAI.*\r?\n/m,'').replace(/  \{ name: "OpenRouter configuration", run: \(\) => \{[\s\S]*?\r?\n  \} \},\r?\n/,'').replace(/^if \(env.AI_ENABLED.*verifyAI\(api\).*\r?\n/m,''));
await edit('components/dashboard/app-shell.tsx',s=>s.replace(/^.*href: "\/dashboard\/chat".*\r?\n/m,''));
await edit('package.json',s=>{const p=JSON.parse(s);for(const name of ['ai','@ai-sdk/react','@openrouter/ai-sdk-provider'])delete p.dependencies[name];delete p.scripts['kickstart:ai'];return JSON.stringify(p,null,2)});
await symlink(join(root,'node_modules'),join(target,'node_modules'),'junction');
console.log(`Secret-free AI removal copy: ${target}`);
const result=spawnSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:target,encoding:'utf8',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},timeout:180000});
console.log(result.stdout);if(result.stderr)console.error(result.stderr);
if(result.error)throw result.error;
process.exitCode=result.status||0;
