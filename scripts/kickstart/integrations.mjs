import { sqlString } from "./core.mjs"

export function integrationAuthSettings(config) {
  if (!config.oauthEnabled) return {}
  return {
    oauth_server_enabled: true,
    oauth_server_allow_dynamic_registration: true,
    oauth_server_authorization_path: "/oauth/consent",
    hook_custom_access_token_enabled: true,
    hook_custom_access_token_uri:
      "pg-functions://postgres/public/mcp_access_token_hook",
  }
}
export function integrationProbe(config, api, env) {
  return {
    name: "API/MCP configuration and hosted OAuth capability",
    run: async () => {
      if (
        ["apiEnabled", "mcpEnabled", "oauthEnabled"].some(
          (k) => typeof config[k] !== "boolean"
        ) ||
        !Array.isArray(config.operations) ||
        config.operations.some(
          (op) =>
            !["get_workspace", "rename_workspace"].includes(
              op
            )
        )
      )
        throw new Error("Invalid config/integrations.json.")
      if (!config.oauthEnabled)
        return "OAuth disabled; existing API credentials remain unchanged."
      const actual = await api.management("/config/auth")
      for (const field of Object.keys(integrationAuthSettings(config)))
        if (!(field in actual))
          throw new Error(
            "This hosted project does not expose the required OAuth/hook settings."
          )
      if (
        actual.hook_custom_access_token_uri &&
        actual.hook_custom_access_token_uri !==
          integrationAuthSettings(config).hook_custom_access_token_uri
      )
        throw new Error(
          "An existing access-token hook belongs to the buyer. Integrate it explicitly before enabling MCP OAuth; it will not be overwritten."
        )
      const response = await fetch(
        env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/.well-known/jwks.json",
        { signal: AbortSignal.timeout(10000) }
      )
      if (!response.ok)
        throw new Error("Could not read the OAuth public signing keys.")
      const jwks = await response.json()
      if (!jwks.keys?.some((k) => ["ES256", "RS256"].includes(k.alg)))
        throw new Error(
          "OAuth requires an active asymmetric signing key. Configure one in Supabase Auth before retrying."
        )
      return "OAuth settings and public signing keys readable. Hook execution and token issuance require post-install verification."
    },
  }
}
export function integrationStep(config, api, env) {
  return {
    name: "Configure and verify application integration permissions",
    run: async () => {
      if (!config.oauthEnabled) return
      const audience = new URL("/api/mcp", env.APP_URL).href
      await api.query(
        "insert into private.integration_settings(singleton,audience) values(true," +
          sqlString(audience) +
          ") on conflict(singleton) do update set audience=excluded.audience",
        false
      )
      const [result] = await api.query(
        "select has_function_privilege('supabase_auth_admin','public.mcp_access_token_hook(jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.mcp_access_token_hook(jsonb)','EXECUTE') and not has_function_privilege('anon','public.consume_mcp_connection(uuid,uuid,uuid,uuid)','EXECUTE') as protected"
      )
      if (!result?.protected)
        throw new Error(
          "Integration hook/RPC permissions could not be verified."
        )
    },
  }
}
