import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createApi, digest } from '../kickstart/core.mjs';
export const root = new URL('../../', import.meta.url);
export async function adminTarget() {
 const env={...process.env,...parseEnv(await readFile(new URL('.env',root),'utf8'))};
 if(!/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF||'')) throw Error('Run kickstart to configure a hosted project first.');
 if(env.NEXT_PUBLIC_SUPABASE_URL!==`https://${env.SUPABASE_PROJECT_REF}.supabase.co`) throw Error('Application URL does not match the configured hosted project.');
 const receipt=JSON.parse(await readFile(new URL(`.kickstart/${env.SUPABASE_PROJECT_REF}.json`,root),'utf8'));
 if(receipt.project!==env.SUPABASE_PROJECT_REF) throw Error('Restore the receipt for the configured project.');
 const api=createApi(env);const project=await api.management('');
 if(project.id!==receipt.project || project.status!=='ACTIVE_HEALTHY') throw Error('Configured project identity or health did not match.');
 const migrations=await Promise.all((await readdir(new URL('supabase/migrations/',root))).filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort().map(async name=>({name,sql:await readFile(new URL(`supabase/migrations/${name}`,root),'utf8')})));
 const installed=await api.query('select version,checksum from private.kickstart_migrations');
 for(const row of installed){const source=migrations.find(m=>m.name===row.version);if(!source||digest(source.sql)!==row.checksum) throw Error('Restore migrations matching the installed checksum ledger.');}
 if(!installed.length) throw Error('Complete kickstart first.');
 return {env,api,migrations,installed,project};
}
// Only hexadecimal generated locally enters SQL syntax. Email is decoded as data.
export function emailSql(email) {
 if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email.trim())) throw Error('Provide an existing account email.');
 return `convert_from(decode('${Buffer.from(email.trim().toLowerCase(),'utf8').toString('hex')}','hex'),'UTF8')`;
}
