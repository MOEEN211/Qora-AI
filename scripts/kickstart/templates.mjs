import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digest } from "./core.mjs";

export const templateDefinitions = [
  { kind: "welcome", key: "RESEND_TEMPLATE_WELCOME_ID", subject: "Welcome to" },
  { kind: "verification", key: "RESEND_TEMPLATE_VERIFICATION_ID", subject: "Verify your email for" },
  { kind: "password-reset", key: "RESEND_TEMPLATE_PASSWORD_RESET_ID", subject: "Reset your password for" },
  { kind: "magic-link", key: "RESEND_TEMPLATE_MAGIC_LINK_ID", subject: "Your sign-in link for" },
  { kind: "workspace-invitation", key: "RESEND_TEMPLATE_WORKSPACE_INVITATION_ID", subject: "You're invited to a workspace on", variables: ['ACTION_URL','WORKSPACE','INVITER','ROLE','EXPIRES'] },
];
const escapeHtml = value => value.replace(/[&<>"'{}]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;" })[c]);

export async function loadTemplates(root, env) {
  return Promise.all(templateDefinitions.map(async definition => {
    const payload = {
      name: `${env.APP_NAME} · ${definition.kind}`,
      from: env.RESEND_FROM_EMAIL,
      subject: `${definition.subject} ${env.APP_NAME}`,
      html: (await readFile(resolve(root, "emails", `${definition.kind}.html`), "utf8")).replaceAll("{{APP_NAME}}", escapeHtml(env.APP_NAME || "Forma")),
      variables: (definition.variables || ['ACTION_URL']).map(key => ({ key, type: "string" })),
    };
    // Resend limits aliases to 50 characters. Keep the full project reference
    // and content fingerprint; shorten only the human-readable template kind.
    const aliasKind = definition.kind.slice(0, 9).replace(/-+$/, "");
    return { ...definition, payload: { ...payload, alias: `forma-${env.SUPABASE_PROJECT_REF}-${aliasKind}-${digest(JSON.stringify(payload)).slice(0, 12)}` } };
  }));
}

function assertMatches(actual, expected) {
  for (const key of ["alias", "name", "from", "subject", "html"]) {
    if (actual[key] !== expected[key]) throw new Error(`Resend template ${expected.alias} was edited outside the codebase. Reconcile it before retrying; it will not be overwritten.`);
  }
  const variables = value => JSON.stringify((value || []).map(({key,type}) => ({key,type})).sort((a,b) => a.key.localeCompare(b.key)));
  if (variables(actual.variables) !== variables(expected.variables)) throw new Error("Resend template variables do not match the codebase.");
}

export async function inspectTemplates(api, templates, env) {
  const existing = await api.resendList("/templates");
  for (const template of templates) {
    // Configured IDs also bind a rerun to the same Resend account, even when content changes.
    if (env[template.key] && !existing.some(item => item.id === env[template.key])) throw new Error(`${template.key} does not exist in this Resend account. Check the account before continuing.`);
    const match = existing.find(item => item.alias === template.payload.alias);
    if (match) assertMatches(await api.resend(`/templates/${match.id}`), template.payload);
  }
}

export async function publishTemplate(api, template, saveId) {
  // Resend template creation has no documented idempotency header. Reconcile by
  // deterministic, project/content-scoped alias after crashes or lost responses.
  const existing = await api.resendList("/templates");
  let current = existing.find(item => item.alias === template.payload.alias);
  if (!current) current = await api.resend("/templates", { method: "POST", body: JSON.stringify(template.payload) });
  if (!current?.id) throw new Error("Resend did not return a template ID. Rerun to reconcile by alias.");
  let actual = await api.resend(`/templates/${current.id}`);
  assertMatches(actual, template.payload);
  if (actual.status !== "published" || actual.has_unpublished_versions) {
    await api.resend(`/templates/${current.id}/publish`, { method: "POST" });
    actual = await api.resend(`/templates/${current.id}`);
  }
  assertMatches(actual, template.payload);
  if (actual.status !== "published" || actual.has_unpublished_versions) throw new Error("Resend template publication was not confirmed. Rerun to resume.");
  await saveId(template.key, actual.id);
  return actual.id;
}
