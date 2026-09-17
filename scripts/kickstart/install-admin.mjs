import { adminTarget } from '../admin/target.mjs';
import { migrationQuery } from './core.mjs';
import { verifyAdmin } from './admin.mjs';
try {
 if(process.argv.slice(2).some(a=>a!=='--check')) throw Error('Usage: npm run kickstart:admin [-- --check]');
 const {api,migrations,env}=await adminTarget();
 await api.authSettings();
 const [dependencies]=await api.query("select to_regclass('public.onboarding') is not null and to_regclass('private.bug_reports') is not null as core,to_regclass('private.billing_accounts') is not null as billing,to_regclass('private.ai_generations') is not null as ai");
 if(!dependencies.core) throw Error('Install onboarding and feedback before admin.');
 const selected=migrations.filter(m=>/_operator_(admin|refinements)\.sql$/.test(m.name)||(m.name.includes('_operator_billing_')&&dependencies.billing)||(m.name.includes('_operator_ai_')&&dependencies.ai&&env.AI_ENABLED==='true'));
 if(!selected.length) throw Error('Admin migrations are missing.');
 console.log('Read-only admin preflight passed. DDL permission remains unverified until installation.');
 if(!process.argv.includes('--check')) {
 for(const m of selected){await api.query(migrationQuery(m.name,m.sql),false);console.log(`Installed/verified ${m.name}`);}
 console.log(await verifyAdmin(api));
 console.log('Admin schema installed. Accounts, grants and provider resources preserved. Upgrade existing hosted billing workers separately for complete MRR reporting.');
 }
}catch(error){console.error(error.code==='ENOENT'?'Restore .env and the matching receipt.':error.message);process.exitCode=1;}
