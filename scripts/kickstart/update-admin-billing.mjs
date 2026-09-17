// Explicit provider upgrade. Never run by admin schema installation or report reads.
import { adminTarget,root } from '../admin/target.mjs';
import { createBillingSetup } from './billing.mjs';
import { fileURLToPath } from 'node:url';
try {
 if(process.argv.slice(2).some(a=>a!=='--check')) throw Error('Usage: npm run kickstart:admin:billing [-- --check]');
 const {api,env}=await adminTarget();
 const [installed]=await api.query("select to_regclass('private.billing_observations') is not null as ready");
 if(!installed.ready) throw Error('Install admin schema first.');
 const modes=await api.query('select mode from private.billing_catalog order by mode');
 const work=[];
 for(const {mode} of modes) {
   const setup=await createBillingSetup({root:fileURLToPath(root),env:mode==='live'?{...env,APP_URL:env.APP_URL_LIVE}:env,api,deploy:mode==='live'});
   await setup.probe.run();work.push(setup);
 }
 console.log('Installed billing modes passed read-only account/catalog/worker checks.');
 if(!process.argv.includes('--check')) for(const setup of work){await setup.step.run();console.log('Owned billing catalog, worker, webhook and schedule upgraded/verified.');}
}catch(error){console.error(error.message);process.exitCode=1;}
