import { test, expect } from "@playwright/test"
import { skipOnboardingIfShown } from "./onboarding-helpers"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { decodeJwt } from "jose"

test.use({ trace: "off", screenshot: "off", video: "off" })
test("Hosted API keys and OAuth: real consent, PKCE, scope, refresh and revocation", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_HOSTED_INTEGRATIONS !== "true",
    "Explicitly opt in to the dedicated hosted integration test."
  )
  test.setTimeout(300_000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.SUPABASE_SECRET_KEY ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.APP_URL ||
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co` ||
    !/^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(env.APP_URL)
  )
    throw new Error(
      "Use only the explicitly configured hosted test target and local app."
    )
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    opts
  )
  const userClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    opts
  )
  const email = `integrations-${randomUUID()}@example.invalid`,
    password = `Fixture-${randomUUID()}!`
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Integration Test" },
  })
  if (user.error || !user.data.user)
    throw new Error("Could not create integration test user.")
  const userId = user.data.user.id
  let clientId: string | undefined
  let peerId: string | undefined
  const clients: Client[] = []
  const connect = async (token: string) => {
    const client = new Client({
      name: "Hosted integration verification",
      version: "1.0.0",
    })
    clients.push(client)
    await client.connect(
      new StreamableHTTPClientTransport(new URL(env.APP_URL + "/api/mcp"), {
        authProvider: { token: async () => token },
      })
    )
    return client
  }
  try {
    const signIn = await userClient.auth.signInWithPassword({ email, password })
    if (signIn.error || !signIn.data.session)
      throw new Error("Ordinary sign-in failed after OAuth hook installation.")
    expect(decodeJwt(signIn.data.session.access_token).role).toBe(
      "authenticated"
    )
    expect(
      (
        await request.get("/api/mcp", {
          headers: {
            Authorization: `Bearer ${signIn.data.session.access_token}`,
          },
        })
      ).status()
    ).toBe(401)
    const member = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
      .single()
    const orgId = member.data?.org_id as string
    expect(Boolean(orgId)).toBe(true)
    const second = await userClient.rpc("create_workspace", {
      workspace_name: "Second integration workspace",
      request_id: randomUUID(),
    })
    expect(second.error?.code ?? null).toBeNull()
    const peer = await admin.auth.admin.createUser({
      email: `peer-${randomUUID()}@example.invalid`,
      password,
      email_confirm: true,
    })
    if (peer.error || !peer.data.user)
      throw new Error("Could not create isolated peer.")
    peerId = peer.data.user.id
    const peerOrg = (
      await admin
        .from("organization_members")
        .select("org_id")
        .eq("user_id", peerId)
        .single()
    ).data?.org_id
    const reader = await userClient.rpc("create_api_key", {
      target: orgId,
      key_name: "Integration reader",
      key_permission: "read",
      days: 30,
    })
    const writer = await userClient.rpc("create_api_key", {
      target: orgId,
      key_name: "Integration writer",
      key_permission: "read_write",
      days: 30,
    })
    if (reader.error || writer.error)
      throw new Error("Could not create fixture API keys.")
    const readHeaders = { Authorization: `Bearer ${reader.data.secret}` },
      writeHeaders = { Authorization: `Bearer ${writer.data.secret}` }
    expect(
      (
        await request.patch("/api/v1/workspace", {
          headers: readHeaders,
          data: { name: "Forbidden" },
        })
      ).status()
    ).toBe(403)
    expect(
      (
        await request.patch("/api/v1/workspace", {
          headers: writeHeaders,
          data: { name: "Forbidden", id: peerOrg },
        })
      ).status()
    ).toBe(400)
    expect(
      (
        await request.patch("/api/v1/workspace", {
          headers: writeHeaders,
          data: { name: "x".repeat(2200) },
        })
      ).status()
    ).toBe(413)
    expect(
      (
        await request.patch("/api/v1/workspace", {
          headers: writeHeaders,
          data: { name: "API integration workspace" },
        })
      ).status()
    ).toBe(200)
    const keyMcp = await connect(writer.data.secret)
    expect((await keyMcp.listTools()).tools.map((t) => t.name)).toContain(
      "rename_workspace"
    )
    const renamed = await keyMcp.callTool({
      name: "rename_workspace",
      arguments: { name: "MCP integration workspace" },
    })
    expect(renamed.isError).not.toBe(true)
    expect(((await renamed.structuredContent) as { id: string }).id).toBe(orgId)
    const readMcp = await connect(reader.data.secret)
    expect((await readMcp.listTools()).tools.map((t) => t.name)).not.toContain(
      "rename_workspace"
    )
    expect(
      (
        await admin
          .from("organizations")
          .select("name")
          .eq("id", orgId)
          .single()
      ).data?.name
    ).toBe("MCP integration workspace")

    const discovery = await fetch(
      env.NEXT_PUBLIC_SUPABASE_URL +
        "/.well-known/oauth-authorization-server/auth/v1"
    ).then((r) => r.json())
    const callback = env.APP_URL + "/oauth-test-callback"
    const registered = await fetch(discovery.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Integration test client",
        redirect_uris: [callback],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    })
    if (!registered.ok)
      throw new Error(
        "Dynamic OAuth client registration failed: " + registered.status
      )
    const registration = await registered.json()
    clientId = registration.client_id
    if (!clientId)
      throw new Error("Dynamic registration returned no client ID.")
    await page.route(callback + "**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Returned to integration test client.</p>",
      })
    )
    async function authorize(permission: "read" | "read_write", deny = false) {
      const verifier = randomBytes(48).toString("base64url"),
        state = randomUUID()
      const authUrl = new URL(discovery.authorization_endpoint)
      authUrl.search = new URLSearchParams({
        client_id: clientId!,
        redirect_uri: callback,
        response_type: "code",
        scope: "openid offline_access",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        resource: env.APP_URL + "/api/mcp",
        prompt: "consent",
      }).toString()
      await page.goto(authUrl.href)
      if (new URL(page.url()).pathname === "/oauth-test-callback")
        throw new Error(
          "OAuth authorization failed: " +
            new URL(page.url()).searchParams.get("error_description")
        )
      const authId = new URL(page.url()).searchParams.get("authorization_id")
      if (
        await page
          .getByRole("heading", { name: "Invalid connection request" })
          .isVisible()
      )
        throw new Error(
          `Provider authorization ID format: length ${authId?.length}, URL-safe ${/^[A-Za-z0-9_-]+$/.test(authId || "")}.`
        )
      if (
        await page
          .getByRole("heading", { name: "Sign in to connect" })
          .isVisible()
      ) {
        await page.getByLabel("Email address", { exact: true }).fill(email)
        await page.getByLabel("Password", { exact: true }).fill(password)
        await page.getByRole("button", { name: "Sign in", exact: true }).click()
        await skipOnboardingIfShown(page)
      }
      await expect(
        page.getByRole("heading", { name: "Connect Integration test client?" })
      ).toBeVisible()
      await page.getByLabel("Workspace", { exact: true }).selectOption(orgId)
      await page
        .locator(`input[name="permission"][value="${permission}"]`)
        .check()
      if (!deny)
        await page.screenshot({
          path: `tmp/oauth-consent-${permission}.png`,
          fullPage: true,
        })
      await page
        .getByRole("button", {
          name: deny ? "Decline" : "Allow access",
          exact: true,
        })
        .click()
      await expect(page).toHaveURL(new RegExp("/oauth-test-callback\\?"))
      const returned = new URL(page.url())
      expect(returned.searchParams.get("state")).toBe(state)
      if (deny) {
        expect(returned.searchParams.get("error")).toBe("access_denied")
        return null
      }
      const code = returned.searchParams.get("code")
      if (!code)
        throw new Error("Approval did not return an authorization code.")
      const response = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId!,
          redirect_uri: callback,
          code,
          code_verifier: verifier,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(
          "OAuth token exchange failed: " +
            response.status +
            " " +
            String(error.error_description || error.msg || error.error)
        )
      }
      return (await response.json()) as {
        access_token: string
        refresh_token: string
      }
    }
    await authorize("read", true)
    expect((await userClient.rpc("list_mcp_connections")).data).toEqual([])
    const tokens = (await authorize("read"))!
    const claims = decodeJwt(tokens.access_token)
    expect(claims.aud).toBe(env.APP_URL + "/api/mcp")
    expect(claims.role).toBe("anon")
    expect(claims.client_id).toBe(clientId)
    const oauthMcp = await connect(tokens.access_token)
    const oauthWorkspace = await oauthMcp.callTool({
      name: "get_workspace",
      arguments: {},
    })
    expect((oauthWorkspace.structuredContent as { id: string }).id).toBe(orgId)
    expect((await oauthMcp.listTools()).tools.map((t) => t.name)).toEqual([
      "get_workspace",
    ])
    expect(
      (
        await request.get("/api/v1/workspace", {
          headers: { Authorization: "Bearer " + tokens.access_token },
        })
      ).status()
    ).toBe(401)
    const direct = await fetch(
      env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/organizations?select=id",
      {
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          Authorization: "Bearer " + tokens.access_token,
        },
      }
    )
    expect(direct.ok).toBe(false)
    const refresh = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      }),
    })
    if (!refresh.ok) throw new Error("OAuth refresh failed: " + refresh.status)
    const refreshed = await refresh.json()
    expect(decodeJwt(refreshed.access_token).forma_connection).toBe(
      claims.forma_connection
    )
    await page.goto(env.APP_URL + "/dashboard/integrations?tab=mcp")
    await page.getByRole("tab", { name: "MCP", exact: true }).click()
    const mcpDocs = page.getByRole("button", {
      name: "Open MCP documentation",
      exact: true,
    })
    await expect(mcpDocs).toBeVisible()
    await expect(
      page.getByText("To connect Claude, publish your app first", {
        exact: true,
      })
    ).toBeVisible()
    await expect(
      page.getByText("This app is running on your computer.", { exact: false })
    ).toBeVisible()
    const buttonAppearance = (element: HTMLElement | SVGElement) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        border: style.border,
        radius: style.borderRadius,
        font: style.font,
        padding: style.padding,
      }
    }
    const mcpButtonAppearance = await mcpDocs.evaluate(buttonAppearance)
    await page.screenshot({
      path: "tmp/integrations-mcp-clear-guide.png",
      fullPage: true,
      animations: "disabled",
    })
    await mcpDocs.click()
    await expect(page).toHaveURL(/\/docs\/mcp$/)
    await expect(
      page.getByRole("heading", {
        name: "Connect an AI assistant",
        exact: true,
      })
    ).toBeVisible()
    await page.goto(env.APP_URL + "/dashboard/integrations")
    const apiDocs = page.getByRole("button", {
      name: "Open API documentation",
      exact: true,
    })
    await expect(apiDocs).toBeVisible()
    expect(await apiDocs.evaluate(buttonAppearance)).toEqual(
      mcpButtonAppearance
    )
    await expect(
      page.getByText("Save your API key as WORKSPACE_API_KEY", { exact: false })
    ).toBeVisible()
    await page.screenshot({
      path: "tmp/integrations-api-matched-button.png",
      fullPage: true,
      animations: "disabled",
      mask: [page.getByRole("table")],
    })
    await apiDocs.click()
    await expect(page).toHaveURL(/\/docs\/api$/)
    await expect(
      page.getByRole("heading", { name: "REST API reference", exact: true })
    ).toBeVisible()
    await page.goto(env.APP_URL + "/dashboard/integrations?tab=mcp")
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(mcpDocs).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.screenshot({
      path: "tmp/integrations-mcp-clear-mobile.png",
      fullPage: true,
      animations: "disabled",
    })
    await page.getByRole("button", { name: "Light mode", exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await expect(
      page.getByText("Integration test client", { exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: "Disconnect", exact: true }).click()
    await expect(
      page.getByText("Integration test client", { exact: true })
    ).not.toBeVisible()
    expect(
      (
        await request.get("/api/mcp", {
          headers: { Authorization: "Bearer " + tokens.access_token },
        })
      ).status()
    ).toBe(401)
    const replacement = (await authorize("read_write"))!
    const newClient = await connect(replacement.access_token)
    expect((await newClient.listTools()).tools.map((t) => t.name)).toContain(
      "rename_workspace"
    )
    const oldRefresh = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshed.refresh_token,
      }),
    })
    expect(oldRefresh.ok).toBe(false)
    const writeResult = await newClient.callTool({
      name: "rename_workspace",
      arguments: { name: "OAuth integration workspace" },
    })
    expect(writeResult.isError).not.toBe(true)
    expect(
      (
        await admin
          .from("organizations")
          .select("name")
          .eq("id", orgId)
          .single()
      ).data?.name
    ).toBe("OAuth integration workspace")
    const removed = await userClient.rpc("revoke_mcp_connection", {
      connection_id: decodeJwt(replacement.access_token).forma_connection,
    })
    expect(removed.error?.code ?? null).toBeNull()
    expect(
      (
        await request.get("/api/mcp", {
          headers: { Authorization: `Bearer ${replacement.access_token}` },
        })
      ).status()
    ).toBe(401)
    await page.goto(env.APP_URL + "/dashboard/integrations?tab=mcp")
    await page.getByRole("tab", { name: "MCP", exact: true }).click()
    await expect(
      page.getByText("Access removed", { exact: false })
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Finish disconnect", exact: true })
      .click()
    try {
      await expect(
        page.getByText("Integration test client", { exact: true })
      ).not.toBeVisible()
    } catch (error) {
      // Record only the disposable connection's public UI, never credentials.
      const connectionCard = page.locator('[data-slot="card"]').filter({
        has: page.getByText("Connected applications", { exact: true }),
      })
      await test.info().attach("disconnect-feedback", {
        body: await connectionCard.innerText(),
        contentType: "text/plain",
      })
      throw error
    }
    expect((await userClient.rpc("list_mcp_connections")).data).toEqual([])
    await userClient.rpc("revoke_api_key", {
      target: orgId,
      key_id: writer.data.id,
    })
    expect(
      (await request.get("/api/mcp", { headers: writeHeaders })).status()
    ).toBe(401)
  } finally {
    await page.close()
    await Promise.allSettled(clients.map((c) => c.close()))
    await userClient.auth.signOut()
    const cleanup = await Promise.allSettled([
      ...(clientId ? [admin.auth.admin.oauth.deleteClient(clientId)] : []),
      ...(peerId ? [admin.auth.admin.deleteUser(peerId)] : []),
      admin.auth.admin.deleteUser(userId),
    ])
    if (
      cleanup.some(
        (result) => result.status === "rejected" || result.value.error
      )
    )
      throw new Error(
        "A disposable integration fixture could not be cleaned up."
      )
  }
})
