import { test, expect } from "@playwright/test"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { createWorkspaceMcpHandler } from "../../lib/mcp/handler"
import { operations } from "../../lib/integrations/schema"
import { IntegrationError } from "../../lib/integrations/errors"

// These tests exercise the actual SDK transports. Database authorization is
// separately tested against the dedicated hosted project.
for (const mode of ["legacy", "auto"] as const) {
  test(`MCP ${mode}: discovery, structured output, read-only isolation and strict input`, async () => {
    let executions = 0
    const workspace = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Fixture",
      slug: "fixture",
      created_at: "2026-09-14T00:00:00Z",
    }
    const handler = createWorkspaceMcpHandler({
      name: "Test",
      permission: "read",
      enabledOperations: Object.keys(operations),
      execute: async () => {
        executions++
        return workspace
      },
    })
    const transport = new StreamableHTTPClientTransport(
      new URL("https://app.example.com/api/mcp"),
      { fetch: async (input, init) => handler.fetch(new Request(input, init)) }
    )
    const client = new Client(
      { name: "Protocol test", version: "1.0.0" },
      { versionNegotiation: { mode } }
    )
    try {
      await client.connect(transport)
      const list = await client.listTools()
      expect(list.tools.map((t) => t.name)).toEqual(["get_workspace"])
      const result = await client.callTool({
        name: "get_workspace",
        arguments: {},
      })
      expect(result.structuredContent).toEqual(workspace)
      await expect(
        client.callTool({ name: "list_workspaces", arguments: {} })
      ).rejects.toThrow("not found")
      expect(list.tools[0].annotations?.readOnlyHint).toBe(true)
      const invalid = await client.callTool({
        name: "get_workspace",
        arguments: { workspace_id: "another-tenant" },
      })
      expect(invalid.isError).toBe(true)
      await expect(
        client.callTool({
          name: "rename_workspace",
          arguments: { name: "Forbidden" },
        })
      ).rejects.toThrow("not found")
      expect(executions).toBe(1)
    } finally {
      await client.close()
    }
  })
}

test("MCP write input, disabled tools and safe error results", async () => {
  let supplied: unknown
  let fail = false
  const handler = createWorkspaceMcpHandler({
    name: "Test",
    permission: "read_write",
    enabledOperations: ["rename_workspace"],
    execute: async (_, input) => {
      supplied = input
      if (fail) throw new Error("secret database connection information")
      throw new IntegrationError(
        409,
        "workspace_unavailable",
        "Workspace unavailable."
      )
    },
  })
  const client = new Client({ name: "Protocol test", version: "1.0.0" })
  const transport = new StreamableHTTPClientTransport(
    new URL("https://app.example.com/api/mcp"),
    { fetch: async (input, init) => handler.fetch(new Request(input, init)) }
  )
  try {
    await client.connect(transport)
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      "rename_workspace",
    ])
    const invalid = await client.callTool({
      name: "rename_workspace",
      arguments: { name: "  " },
    })
    expect(invalid.isError).toBe(true)
    expect(supplied).toBeUndefined()
    const result = await client.callTool({
      name: "rename_workspace",
      arguments: { name: "  New name  " },
    })
    expect(supplied).toEqual({ name: "New name" })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain("workspace_unavailable")
    fail = true
    const safe = await client.callTool({
      name: "rename_workspace",
      arguments: { name: "New name" },
    })
    expect(JSON.stringify(safe)).not.toContain("secret database")
    expect(JSON.stringify(safe.content)).toContain("service_unavailable")
  } finally {
    await client.close()
  }
})
