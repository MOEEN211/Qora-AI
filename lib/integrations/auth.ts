import "server-only"
import { createHash } from "node:crypto"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { IntegrationError, mcpUrl } from "./http"
import config from "@/config/integrations.json"
const principal = z.object({
  status: z.literal(200),
  org_id: z.uuid(),
  permission: z.enum(["read", "read_write"]),
  credential_id: z.uuid().nullable(),
})
export type Principal = z.infer<typeof principal>
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
export async function authorize(
  request: Request,
  permission: "read" | "write" = "read",
  allowOAuth = false
): Promise<Principal> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!token || token.length > 16384)
    throw new IntegrationError(
      401,
      "invalid_token",
      "A valid Bearer credential is required."
    )
  const admin = createAdminClient()
  let result
  if (/^forma_[a-f0-9]{64}$/.test(token)) {
    result = await admin.rpc("consume_api_key", {
      token_digest: createHash("sha256").update(token).digest("hex"),
      required_permission: permission,
    })
  } else {
    if (!allowOAuth || !config.oauthEnabled)
      throw new IntegrationError(
        401,
        "invalid_token",
        "API key is invalid, expired, or revoked."
      )
    const issuer = process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1"
    jwks ??= createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"), {
      timeoutDuration: 5000,
    })
    let claims
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: mcpUrl(),
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["exp", "iat", "sub"],
      })
      claims = z
        .object({
          sub: z.uuid(),
          client_id: z.uuid(),
          session_id: z.uuid(),
          forma_connection: z.uuid(),
          role: z.literal("anon"),
        })
        .parse(payload)
    } catch {
      throw new IntegrationError(
        401,
        "invalid_token",
        "Connection is invalid, expired, or revoked. Reconnect your application."
      )
    }
    result = await admin.rpc("consume_mcp_connection", {
      connection_id: claims.forma_connection,
      token_user: claims.sub,
      token_client: claims.client_id,
      token_session: claims.session_id,
    })
  }
  if (result.error)
    throw new IntegrationError(
      503,
      "service_unavailable",
      "API temporarily unavailable."
    )
  const status = result.data?.status
  if (status !== 200)
    throw new IntegrationError(
      status === 429 ? 429 : status === 403 ? 403 : 401,
      status === 429
        ? "rate_limited"
        : status === 403
          ? "insufficient_permission"
          : "invalid_token",
      status === 429
        ? "Rate limit exceeded. Try again in one minute."
        : status === 403
          ? "This credential has read-only access."
          : "Credential is invalid, expired, or revoked."
    )
  // Previous installations return only status and org_id. The RPC already
  // checked the requested REST permission. MCP requires the new grant fields.
  const legacy = z
    .object({
      status: z.literal(200),
      org_id: z.uuid(),
      permission: z.undefined(),
      credential_id: z.undefined(),
    })
    .safeParse(result.data)
  if (!allowOAuth && legacy.success)
    return {
      ...legacy.data,
      permission: permission === "write" ? "read_write" : "read",
      credential_id: null,
    }
  const parsed = principal.safeParse(result.data)
  if (!parsed.success)
    throw new IntegrationError(
      503,
      "setup_required",
      "Complete kickstart before connecting an MCP client."
    )
  return parsed.data
}
