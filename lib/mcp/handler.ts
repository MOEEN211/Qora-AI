import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"
import { operations, type Operation } from "../integrations/schema"
import { IntegrationError } from "../integrations/errors"

type Options = {
  name: string
  permission: "read" | "read_write"
  enabledOperations: readonly string[]
  execute: (
    operation: Operation,
    input: unknown
  ) => Promise<Record<string, unknown>>
}

// One server per request. Never cache a server carrying a user's credentials.
export function createWorkspaceMcpHandler(options: Options) {
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: options.name, version: "1.0.0" })
      for (const name of Object.keys(operations) as Operation[]) {
        const op = operations[name]
        if (
          !options.enabledOperations.includes(name) ||
          (op.permission === "write" && options.permission !== "read_write")
        )
          continue
        server.registerTool(
          name,
          {
            title: op.title,
            description: op.description,
            inputSchema: op.input,
            outputSchema: op.output,
            annotations: {
              readOnlyHint: op.permission === "read",
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
          async (input: unknown) => {
            try {
              const result = await options.execute(name, input)
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify(result) },
                ],
                structuredContent: result,
              }
            } catch (error) {
              const e =
                error instanceof IntegrationError
                  ? error
                  : new IntegrationError(
                      503,
                      "service_unavailable",
                      "Service temporarily unavailable."
                    )
              return {
                isError: true,
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: e.message, code: e.code }),
                  },
                ],
              }
            }
          }
        )
      }
      return server
    },
    { legacy: "stateless", responseMode: "json", maxSubscriptions: 0 }
  )
}
