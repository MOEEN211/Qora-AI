import "server-only"
import { randomUUID } from "node:crypto"
import { IntegrationError } from "./errors"
export { IntegrationError } from "./errors"
export function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000")
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("Invalid APP_URL")
  return url.origin
}
export const mcpUrl = () => appOrigin() + "/api/mcp"
export function validateOrigin(request: Request) {
  const origin = request.headers.get("origin"),
    allowed = [appOrigin()]
  if (process.env.NODE_ENV === "development") {
    const url = new URL(appOrigin())
    if (["localhost", "127.0.0.1"].includes(url.hostname)) {
      url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost"
      allowed.push(url.origin)
    }
  }
  if (origin !== null && !allowed.includes(origin))
    throw new IntegrationError(
      403,
      "invalid_origin",
      "This origin is not allowed."
    )
}
export async function readBounded(request: Request, maxBytes: number) {
  const reader = request.body?.getReader()
  if (!reader)
    throw new IntegrationError(400, "invalid_body", "Provide a JSON body.")
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel()
        throw new IntegrationError(
          413,
          "body_too_large",
          "Request body too large."
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new IntegrationError(400, "invalid_json", "Provide valid JSON.")
  }
}
export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": randomUUID(),
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  })
}
export function errorResponse(error: unknown, oauth = false) {
  const e =
    error instanceof IntegrationError
      ? error
      : new IntegrationError(
          503,
          "service_unavailable",
          "API temporarily unavailable."
        )
  const response = json({ error: e.message, code: e.code }, e.status)
  if (e.status === 401)
    response.headers.set(
      "WWW-Authenticate",
      oauth
        ? 'Bearer resource_metadata="' +
            appOrigin() +
            '/.well-known/oauth-protected-resource/api/mcp"'
        : 'Bearer realm="workspace-api"'
    )
  return response
}
