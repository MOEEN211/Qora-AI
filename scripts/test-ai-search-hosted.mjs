import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createApi,migrationQuery} from './kickstart/core.mjs';
const env={...process.env,...parseEnv(await readFile('.env','utf8'))};
if(!env.HOSTED_TEST_PROJECT_REF || env.HOSTED_TEST_PROJECT_REF!==env.SUPABASE_PROJECT_REF) throw new Error('Configure the explicitly authorized hosted test target.');
const api=createApi(env);
const [state]=await api.query("select to_regprocedure('public.ai_search_chats(uuid,text,timestamptz,uuid)') is not null as installed");
let sql='begin;';
if(!state.installed) sql=migrationQuery('20260914120000_workspace_ai_search.sql',await readFile('supabase/migrations/20260914120000_workspace_ai_search.sql','utf8')).replace(/commit;\s*$/,'');
sql+=`
select set_config('test.search_user',gen_random_uuid()::text,true);
select set_config('test.search_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role) values
 (current_setting('test.search_user')::uuid,'search-'||current_setting('test.search_user')||'@example.invalid',now(),'{}','authenticated','authenticated'),
 (current_setting('test.search_other')::uuid,'search-'||current_setting('test.search_other')||'@example.invalid',now(),'{}','authenticated','authenticated');
select set_config('test.search_org',(select org_id::text from public.organization_members where user_id=current_setting('test.search_user')::uuid limit 1),true);
select set_config('test.search_other_org',(select org_id::text from public.organization_members where user_id=current_setting('test.search_other')::uuid limit 1),true);
insert into private.ai_chats(id,org_id,title,created_at)
 select gen_random_uuid(),current_setting('test.search_org')::uuid,'Project notes '||n,now()-n*interval '1 day' from generate_series(1,25) n;
insert into private.ai_chats(id,org_id,title,created_at) values
 (gen_random_uuid(),current_setting('test.search_org')::uuid,'Needle 100% complete',now()-interval '90 days'),
 (gen_random_uuid(),current_setting('test.search_other_org')::uuid,'Needle private conversation',now());
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.search_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare results jsonb; older jsonb; cursor jsonb; begin
 results:=public.ai_search_chats(current_setting('test.search_org')::uuid,'');
 if jsonb_array_length(results)<>21 then raise exception 'Missing pagination sentinel'; end if;
 cursor:=results->19;
 older:=public.ai_search_chats(current_setting('test.search_org')::uuid,'',(cursor->>'created_at')::timestamptz,(cursor->>'id')::uuid);
 if jsonb_array_length(older)<>6 then raise exception 'Incorrect second page'; end if;
 results:=public.ai_search_chats(current_setting('test.search_org')::uuid,'  nEeDlE  ');
 if jsonb_array_length(results)<>1 or results->0->>'title'<>'Needle 100% complete' then raise exception 'Search missed an older chat or leaked another tenant'; end if;
 if jsonb_array_length(public.ai_search_chats(current_setting('test.search_org')::uuid,'%'))<>1 then raise exception 'Search interpreted a literal as wildcard'; end if;
 if jsonb_array_length(public.ai_search_chats(current_setting('test.search_org')::uuid,'absent'))<>0 then raise exception 'Empty search mismatch'; end if;
 begin
   perform public.ai_search_chats(current_setting('test.search_other_org')::uuid,'Needle');
   raise exception 'Cross-tenant search allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
   perform public.ai_search_chats(current_setting('test.search_org')::uuid,'');
   raise exception 'Anonymous search allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;`;
await api.query(sql,false);
console.log('Hosted history search passed: older-than-first-page matches, literal/case-insensitive search, cursor pagination, empty results, tenant and anonymous isolation. All fixtures rolled back.');
