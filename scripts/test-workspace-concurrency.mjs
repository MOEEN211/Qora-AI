import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';

const env=parseEnv(await readFile('.env','utf8'));
if(!env.HOSTED_TEST_PROJECT_REF||env.HOSTED_TEST_PROJECT_REF!==env.SUPABASE_PROJECT_REF||env.NEXT_PUBLIC_SUPABASE_URL!==`https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`)throw Error('Explicit hosted target required');
const auth={persistSession:false,autoRefreshToken:false};
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth});
const users=[],clients=[];
async function user(name,token){
  const email=`race-${randomUUID()}@example.invalid`,password=`Race-${randomUUID()}!`;
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name,...(token?{workspace_invitation:token}:{})}});
  if(result.error)throw Error('Fixture creation failed');
  users.push(result.data.user.id);
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth});
  if((await client.auth.signInWithPassword({email,password})).error)throw Error('Fixture sign-in failed');
  clients.push(client);
  return {id:result.data.user.id,email,client};
}
async function invite(owner,target,email,role='member'){
  const {data,error}=await owner.client.rpc('issue_workspace_invitation',{target,recipient:email,invited_role:role});
  if(error)throw Error('Fixture invitation failed');return data.token;
}
try {
  const a=await user('Race A'),b=await user('Race B');
  const orgA=(await a.client.from('organization_members').select('org_id').eq('user_id',a.id).single()).data.org_id;
  const orgB=(await b.client.from('organization_members').select('org_id').eq('user_id',b.id).single()).data.org_id;
  const token=await invite(a,orgA,b.email);
  const duplicate=await Promise.all([b.client.rpc('accept_workspace_invitation',{invitation_token:token}),b.client.rpc('accept_workspace_invitation',{invitation_token:token})]);
  assert.ok(duplicate.every(result=>!result.error&&result.data===orgA));
  assert.equal((await a.client.rpc('transfer_workspace_ownership',{target:orgA,person:b.id})).error,null);
  const leaves=await Promise.all([a.client.rpc('change_workspace_member',{target:orgA,person:a.id,new_role:null}),b.client.rpc('change_workspace_member',{target:orgA,person:b.id,new_role:null})]);
  assert.equal(leaves.filter(result=>!result.error).length,1);
  assert.equal((await admin.from('organization_members').select('user_id').eq('org_id',orgA).eq('role','owner')).data.length,1);
  // Create an invited account with only these two memberships (no personal space).
  const remainingId=(await admin.from('organization_members').select('user_id').eq('org_id',orgA).eq('role','owner').single()).data.user_id;
  const remaining=remainingId===a.id?a:b;
  const email=`race-invited-${randomUUID()}@example.invalid`,password=`Race-${randomUUID()}!`;
  const inviteToken=await invite(remaining,orgA,email);
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Race Invited',workspace_invitation:inviteToken}});
  if(created.error)throw Error('Invited fixture failed');
  const person=created.data.user.id;users.push(person);
  const c=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth});clients.push(c);
  await c.auth.signInWithPassword({email,password});
  const secondToken=await invite(b,orgB,email);
  assert.equal((await c.rpc('accept_workspace_invitation',{invitation_token:secondToken})).error,null);
  assert.equal((await admin.from('organization_members').select('org_id').eq('user_id',person)).data.length,2);
  const removed=await Promise.all([remaining.client.rpc('change_workspace_member',{target:orgA,person,new_role:null}),b.client.rpc('change_workspace_member',{target:orgB,person,new_role:null})]);
  assert.ok(removed.every(result=>!result.error));
  const memberships=(await admin.from('organization_members').select('org_id,role').eq('user_id',person)).data;
  assert.equal(memberships.length,1);assert.equal(memberships[0].role,'owner');assert.ok(![orgA,orgB].includes(memberships[0].org_id));
  // A revoke/accept race may accept before revocation or reject after it, but never duplicate membership.
  const d=await user('Race Recipient');
  const raceToken=await invite(remaining,orgA,d.email);
  const invitations=(await remaining.client.rpc('workspace_team',{target:orgA})).data.invitations;
  const invitation=invitations.find(i=>i.email===d.email);
  const raced=await Promise.all([d.client.rpc('accept_workspace_invitation',{invitation_token:raceToken}),remaining.client.rpc('revoke_workspace_invitation',{target:orgA,invitation_id:invitation.id})]);
  const count=(await admin.from('organization_members').select('user_id').eq('org_id',orgA).eq('user_id',d.id)).data.length;
  assert.equal(count,raced[0].error?0:1);
  // Acceptance against deletion must leave no dangling access, regardless of winner.
  const disposable=await remaining.client.rpc('create_workspace',{workspace_name:'Race deletion',request_id:randomUUID()});
  assert.equal(disposable.error,null);
  const deletionToken=await invite(remaining,disposable.data,d.email);
  const deleted=await Promise.all([d.client.rpc('accept_workspace_invitation',{invitation_token:deletionToken}),admin.rpc('delete_workspace',{target:disposable.data,actor:remaining.id,confirmation:'Race deletion'})]);
  assert.equal(deleted[1].error,null);
  assert.equal((await admin.from('organization_members').select('user_id').eq('org_id',disposable.data)).data.length,0);
  assert.ok((await admin.from('organization_members').select('org_id').eq('user_id',d.id)).data.length>=1);
  const transferOrg=(await a.client.rpc('create_workspace',{workspace_name:'Transfer race',request_id:randomUUID()})).data;
  for(const recipient of [b,d]){const token=await invite(a,transferOrg,recipient.email);assert.equal((await recipient.client.rpc('accept_workspace_invitation',{invitation_token:token})).error,null);}
  const competing=await Promise.all([b,d].map(recipient=>a.client.rpc('transfer_workspace_ownership',{target:transferOrg,person:recipient.id})));
  assert.equal(competing.filter(r=>!r.error).length,1);
  const owner=competing[0].error?d:b;
  assert.equal((await admin.from('organization_members').select('user_id').eq('org_id',transferOrg).eq('role','owner')).data.length,1);
  const transferOrRemove=await Promise.all([owner.client.rpc('transfer_workspace_ownership',{target:transferOrg,person:a.id}),owner.client.rpc('change_workspace_member',{target:transferOrg,person:a.id,new_role:null})]);
  assert.equal(transferOrRemove.filter(r=>!r.error).length,1);
  assert.equal((await admin.from('organization_members').select('user_id').eq('org_id',transferOrg).eq('role','owner')).data.length,1);
  console.log('Hosted concurrency passed: competing transfers, transfer versus removal, owner departure guard, duplicate acceptance, final-membership fallbacks, and acceptance versus revocation/deletion.');
} finally {
  for(const id of users){
    const rows=(await admin.from('organization_members').select('org_id,organizations(name)').eq('user_id',id).eq('role','owner')).data||[];
    for(const row of rows){const result=await admin.rpc('delete_workspace',{target:row.org_id,actor:id,confirmation:row.organizations.name});if(result.error)throw Error('Fixture workspace cleanup failed');}
  }
  for(const client of clients)await client.auth.signOut();
  for(const id of users){if((await admin.auth.admin.deleteUser(id)).error)throw Error('Fixture cleanup failed');}
  console.log('All concurrency fixture accounts and workspaces removed.');
}
