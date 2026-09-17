import { parseArgs } from 'node:util';
import { adminTarget,emailSql } from './target.mjs';
try {
 const {values,positionals}=parseArgs({allowPositionals:true,options:{email:{type:'string'},check:{type:'boolean',default:false}}});
 const [action]=positionals;
 if(positionals.length!==1||!['grant','revoke'].includes(action)) throw Error('Usage: npm run admin:grant -- --email owner@example.com [--check]');
 const email=emailSql(values.email);
 const {api,project}=await adminTarget();
 const [ready]=await api.query("select to_regprocedure('private.operator_command(text,boolean)') is not null as ready");
 if(!ready.ready) throw Error('Run npm run kickstart:admin first.');
 const accounts=await api.query(`select id,email,email_confirmed_at is not null as confirmed,exists(select 1 from private.operator_users where user_id=u.id) as operator from auth.users u where lower(email)=${email}`);
 if(accounts.length!==1||(action==='grant'&&!accounts[0].confirmed)) throw Error('Account not found, or not confirmed for an admin grant.');
 console.log(`Project ${project.id}: ${action} admin for ${accounts[0].email}.`);
 if(values.check) console.log('Read-only checks passed. No access changed; write permission remains unverified.');
 else {const [result]=await api.query(`select private.operator_command(${email},${action==='grant'}) as result`,false);console.log(result.result.changed?'Admin access updated. Sign in at /admin.':'Access already matches the request.');}
} catch(error){console.error(error.code==='ENOENT'?'Restore .env and the matching kickstart receipt.':error.message);process.exitCode=1;}
