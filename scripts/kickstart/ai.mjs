import { aiConfig } from "../../lib/ai/config.mjs";
export async function checkAI(env,fetcher=fetch) {
  const config=aiConfig(env);
  if(!["true","false"].includes(env.AI_ENABLED || "false")) throw new Error("AI_ENABLED must be true or false.");
  if(!config.enabled) return "AI disabled; no provider request made.";
  if(!config.key?.trim()) throw new Error("Fill OPENROUTER_API_KEY in .env, or set AI_ENABLED=false.");
  async function read(path) {
    const response=await fetcher(`https://openrouter.ai/api/v1/${path}`,{headers:{Authorization:`Bearer ${config.key}`},signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error(`OpenRouter read-only check returned HTTP ${response.status}. Check the key and account access.`);
    return response.json();
  }
  const [key,models]=await Promise.all([read("key"),read("models")]);
  if(!key.data || !Array.isArray(models.data)) throw new Error("OpenRouter returned an unexpected response.");
  if(key.data.limit_remaining!=null && key.data.limit_remaining<=0) throw new Error("The OpenRouter key has no remaining budget. Fund the account or increase its key limit.");
  const model=models.data.find(m=>m.id===config.model);
  if(!model || !model.architecture?.output_modalities?.includes("text")) throw new Error("AI_MODEL must identify an available text model in the OpenRouter catalog.");
  return "OpenRouter key and text model checked without generation. Provider availability, routing restrictions and actual generation remain unverified until a real request.";
}
export async function verifyAI(api) {
  const [state]=await api.query(`select
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('ai_chats','ai_generations','ai_credit_accounts') and c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as tables,
    has_function_privilege('authenticated','public.ai_history(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.ai_history(uuid,text,jsonb)','EXECUTE') as history,
    has_schema_privilege('service_role','private','USAGE') and has_function_privilege('service_role','public.ai_run(text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.ai_run(text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.ai_run(text,jsonb)','EXECUTE') as generation,
    (select count(*)::integer from cron.job where jobname='forma-ai-recovery' and active) as jobs,
    exists(select 1 from pg_trigger where tgname='on_workspace_created_ai' and tgrelid='public.organizations'::regclass and tgenabled='O') as grant_trigger,
    has_function_privilege('authenticated','public.ai_search_chats(uuid,text,timestamptz,uuid)','EXECUTE') and not has_function_privilege('anon','public.ai_search_chats(uuid,text,timestamptz,uuid)','EXECUTE') as search`);
  if(state.tables!==3 || !state.history || !state.generation || state.jobs!==1 || !state.grant_trigger || !state.search) throw new Error('AI storage permissions or recovery schedule verification failed. Inspect the AI migration.');
}
