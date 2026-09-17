export const DEFAULT_AI_MODEL = "openai/gpt-4.1-mini";
export function aiConfig(env) {
  return { enabled: env.AI_ENABLED === "true", model: env.AI_MODEL || DEFAULT_AI_MODEL, key: env.OPENROUTER_API_KEY };
}
export const SYSTEM_PROMPT = "You are the helpful assistant in a SaaS starter template. Help users brainstorm SaaS applications, validate product ideas, plan features, improve onboarding, write product copy, and answer practical questions related to their project. Be concise, friendly, and specific. Ask a short clarifying question when important project context is missing. Write plain text only: use short paragraphs or numbered lists. Do not use asterisks, Markdown headings, bold or italic markers, or code fences. You have no tools or access to project files, workspace data, or external services beyond the conversation provided; never claim to have inspected or changed them.";
export function chatMessageIds(requestId) {
  return { user: requestId, assistant: `${requestId}-assistant` };
}
export function boundedContext(history, prompt) {
  const selected=[]; let size=prompt.length;
  for(const turn of [...history].reverse()) {
    if(size+turn.prompt.length+turn.output.length>16000) break;
    selected.unshift({role:"user",content:turn.prompt},{role:"assistant",content:turn.output});
    size+=turn.prompt.length+turn.output.length;
  }
  return [...selected,{role:"user",content:prompt}];
}
