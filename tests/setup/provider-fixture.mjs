// Imported only by the isolated CLI integration test. No real network is allowed.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const path = process.env.FAKE_PROVIDER_STATE;
if (!path) throw new Error("This fixture requires an isolated test state path.");
const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { templates: [], functions: [], secrets: [], auth: { external_google_enabled: true, external_google_client_id: "dashboard-client", external_google_secret: "dashboard-secret" }, mutations: [], ledger: false };
const sha = value => createHash("sha256").update(value).digest("hex");
const persist = () => writeFileSync(path, JSON.stringify(state));
let clock = Date.now();
Date.now = () => clock += 1000; // Skip installer pacing against this in-memory fake.
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url), method = options.method || "GET";
  let body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
  const reply = (value, status = 200) => { persist(); return Response.json(value, { status }); };
  if (parsed.pathname === "/auth/v1/.well-known/jwks.json") return reply({keys:[{alg:"ES256"}]});
  if (parsed.pathname.endsWith("/config/auth") && method === "GET") Object.assign(state.auth, {
    mfa_totp_enroll_enabled: true, mfa_totp_verify_enabled: true,
    oauth_server_enabled: state.auth.oauth_server_enabled ?? false,
    oauth_server_allow_dynamic_registration: state.auth.oauth_server_allow_dynamic_registration ?? false,
    oauth_server_authorization_path: state.auth.oauth_server_authorization_path ?? null,
    hook_custom_access_token_enabled: state.auth.hook_custom_access_token_enabled ?? false,
    hook_custom_access_token_uri: state.auth.hook_custom_access_token_uri ?? null,
  });
  if (parsed.hostname === "api.resend.com") {
    if (process.env.FAKE_REJECT_KEY === "yes") return reply({ error: "fake key rejected" }, 401);
    if (parsed.pathname === "/domains") return reply({ data: [{ name: "example.com", status: "verified" }], has_more: false });
    if (parsed.pathname === "/templates" && method === "GET") return reply({ data: state.templates, has_more: false });
    if (parsed.pathname === "/templates" && method === "POST") {
      state.mutations.push("create-template");
      const template = { ...body, id: `template-${state.templates.length + 1}`, status: "draft", has_unpublished_versions: true };
      state.templates.push(template);
      persist();
      if (process.env.FAKE_LOSE_RESPONSE === "yes" && !state.lostResponse) { state.lostResponse = true; persist(); throw new Error("Simulated lost create response"); }
      return reply({ id: template.id });
    }
    const template = state.templates.find(item => parsed.pathname.split("/")[2] === item.id);
    if (template) {
      if (method === "POST") { state.mutations.push("publish-template"); template.status = "published"; template.has_unpublished_versions = false; }
      return reply(template);
    }
  }
  if (parsed.hostname === "abcdefghijklmnopqrst.supabase.co" && parsed.pathname === "/auth/v1/settings") return reply({ external: { email: true, google: state.auth.external_google_enabled } });
  if (parsed.hostname === "abcdefghijklmnopqrst.supabase.co" && parsed.pathname === "/auth/v1/admin/users") return reply({ users: [] }, process.env.FAKE_REJECT_SERVER_KEY === "yes" ? 401 : 200);
  if (parsed.hostname === "api.supabase.com") {
    if (process.env.FAKE_BOOTSTRAP === "yes") {
      if (parsed.pathname === "/v1/profile") return reply({ gotrue_id: "fake-user" });
      if (parsed.pathname === "/v1/organizations") return reply([{ id: "fake-org-id", slug: "fake-org", name: "Fake organization" }]);
      if (parsed.pathname === "/v1/projects/available-regions") return reply({ all: { specific: [{ code: "us-east-1", type: "specific", provider: "AWS" }] } });
      if (parsed.pathname === "/v1/projects") {
        if (method === "POST") {
          state.mutations.push("create-project");
          state.bootstrapProject = { id: "abcdefghijklmnopqrst", ref: "abcdefghijklmnopqrst", status: "ACTIVE_HEALTHY", organization_slug: body.organization_slug, name: body.name, region: body.region_selection.code };
          return reply(state.bootstrapProject);
        }
        return reply(state.bootstrapProject ? [state.bootstrapProject] : []);
      }
      if (parsed.pathname === "/v1/projects/abcdefghijklmnopqrst/api-keys") {
        state.apiKeys ||= [];
        if (method === "POST") {
          state.mutations.push(`create-${body.type}-key`);
          state.apiKeys.push({ type: body.type, name: body.name, api_key: `sb_${body.type}_fake` });
          return reply(state.apiKeys.at(-1));
        }
        return reply(state.apiKeys);
      }
    }
    const endpoint = parsed.pathname.replace("/v1/projects/abcdefghijklmnopqrst", "");
    if (endpoint === "") return reply({ id: "abcdefghijklmnopqrst", status: "ACTIVE_HEALTHY", name: "Dedicated fake" });
    if (endpoint === "/config/auth") {
      if (method === "PATCH") { state.mutations.push("configure-auth"); Object.assign(state.auth, body); }
      return reply(state.auth);
    }
    if (endpoint === "/functions") return reply(state.functions);
    if (endpoint === "/functions/deploy") {
      state.mutations.push("deploy-function");
      const metadata = JSON.parse(body.get("metadata"));
      const source = await body.get("file").text();
      if (!source.includes('npm:standardwebhooks@1.0.0') || source.includes('from "./handler.mjs"')) throw new Error("Incorrect deployed bundle");
      const value = { ...metadata, slug: parsed.searchParams.get("slug"), status: "ACTIVE", version: 1 };
      state.functions.push(value); return reply(value);
    }
    if (endpoint === "/secrets") {
      if (method === "POST") { state.mutations.push("set-secrets"); state.secrets = body.map(item => ({ name: item.name, value: sha(item.value) })); }
      return reply(state.secrets);
    }
      if (endpoint === "/database/query") {
        if (body.query.includes("/* operator-verification */")) return reply([{ ready: true }]);
        if (body.query.includes("/* blog-verification */")) return reply([{ rls: true, readable: true, readonly: true, policies: 1, indexed: true }]);
      if (body.read_only !== false && body.query.includes("public.mcp_access_token_hook(jsonb)")) return reply([{protected:true}]);
      if (body.query.includes("/* workspace-verification */")) return reply([{protected_tables:4,guarded_functions:8,server_functions:2,logo_ready:true}]);
      if (body.query.includes("/* feedback-verification */")) return reply([{ protected_tables: 3, guarded_functions: 6 }]);
      if (body.query.includes("/* notifications-verification */")) return reply([{ protected_table: true, signup_trigger: true, protected_functions: 2, welcome_unique: true, backfilled: true }]);
      if (body.query.includes("/* onboarding-verification */")) return reply([{ protected_table: true, signup_trigger: true, transition_trigger: true, protected_functions: 2, backfilled: true }]);
      if (body.query.includes("/* notification-preferences-verification */")) return reply([{ protected: true, triggers: 2, lookup: true, backfilled: true }]);
      if (body.read_only === false) { state.mutations.push("migration"); state.ledger = true; return reply([]); }
      if (body.query.includes("to_regclass")) return reply([{ ledger: state.ledger, tables: state.ledger ? 3 : 0, users: 0 }]);
      if (body.query.includes("select version, checksum")) return reply(readdirSync("supabase/migrations").map(name => ({ version: name, checksum: sha(readFileSync(`supabase/migrations/${name}`, "utf8")) })));
      if (body.query.includes("pg_class")) return reply(["profiles", "organizations", "organization_members"].map(relname => ({ relname, relrowsecurity: true, policies: 1 })));
      if (body.query.includes("pg_trigger")) return reply([{ active: true }]);
    }
  }
  throw new Error(`Unexpected fake provider request ${method} ${parsed.hostname}${parsed.pathname}`);
};
