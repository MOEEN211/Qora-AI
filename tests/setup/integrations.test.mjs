import test from "node:test"
import assert from "node:assert/strict"
import {
  integrationAuthSettings,
  integrationProbe,
  integrationStep,
} from "../../scripts/kickstart/integrations.mjs"

const config = {
  apiEnabled: true,
  mcpEnabled: true,
  oauthEnabled: true,
  operations: ["get_workspace", "rename_workspace"],
}
const env = {
  APP_URL: "https://app.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.example.com",
}
const settings = {
  ...integrationAuthSettings(config),
  hook_custom_access_token_uri: null,
}

test("OAuth preflight is read-only and requires asymmetric keys", async () => {
  const original = globalThis.fetch
  const calls = []
  const api = {
    management: async (...args) => {
      calls.push(args)
      return settings
    },
  }
  try {
    globalThis.fetch = async () => Response.json({ keys: [{ alg: "ES256" }] })
    assert.match(
      await integrationProbe(config, api, env).run(),
      /post-install verification/
    )
    assert.deepEqual(calls, [["/config/auth"]])
    globalThis.fetch = async () => Response.json({ keys: [] })
    await assert.rejects(
      integrationProbe(config, api, env).run(),
      /asymmetric signing key/
    )
  } finally {
    globalThis.fetch = original
  }
})

test("OAuth preflight preserves a buyer token hook and rejects unsupported settings", async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => {
      throw new Error("Should stop before requesting keys")
    }
    await assert.rejects(
      integrationProbe(
        config,
        {
          management: async () => ({
            ...settings,
            hook_custom_access_token_uri: "https://buyer.example.com/hook",
          }),
        },
        env
      ).run(),
      /will not be overwritten/
    )
    await assert.rejects(
      integrationProbe(config, { management: async () => ({}) }, env).run(),
      /required OAuth/
    )
    await assert.rejects(
      integrationProbe({ ...config, operations: ["unknown"] }, {}, env).run(),
      /Invalid config/
    )
  } finally {
    globalThis.fetch = original
  }
})

test("Disabling OAuth does not mutate existing provider settings", async () => {
  const disabled = { ...config, oauthEnabled: false }
  assert.deepEqual(integrationAuthSettings(disabled), {})
  assert.match(await integrationProbe(disabled, {}, env).run(), /disabled/)
  await integrationStep(disabled, {}, env).run()
})

test("Post-install sets the exact resource audience and verifies privileged boundaries", async () => {
  const calls = []
  await integrationStep(
    config,
    {
      query: async (...args) => {
        calls.push(args)
        return [{ protected: true }]
      },
    },
    env
  ).run()
  assert.equal(calls[0][1], false)
  assert.match(calls[0][0], /https:\/\/app\.example\.com\/api\/mcp/)
  assert.match(calls[0][0], /on conflict\(singleton\) do update/)
  assert.match(calls[1][0], /not has_function_privilege\('anon'/)
  await assert.rejects(
    integrationStep(
      config,
      { query: async () => [{ protected: false }] },
      env
    ).run(),
    /permissions could not be verified/
  )
})
