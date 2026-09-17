import { z } from "zod"
import { operations } from "@/lib/integrations/schema"
import config from "@/config/integrations.json"
import { appOrigin, json } from "@/lib/integrations/http"
export const dynamic = "force-dynamic"
export function GET() {
  if (!config.apiEnabled) return new Response(null, { status: 404 })
  const schema = (value: z.ZodType) =>
    z.toJSONSchema(value, { target: "draft-2020-12" })
  const response = (output: z.ZodType) => ({
    "200": {
      description: "Success",
      content: { "application/json": { schema: schema(output) } },
    },
    "401": { description: "Invalid, expired or revoked API key" },
    "403": { description: "Insufficient permission" },
    "429": { description: "Rate limit exceeded; retry after 60 seconds" },
    "503": { description: "Service unavailable" },
  })
  return json({
    openapi: "3.1.0",
    info: {
      title: (process.env.APP_NAME || "Workspace") + " API",
      version: "1.0.0",
    },
    servers: [{ url: appOrigin() }],
    security: [{ workspaceKey: [] }],
    components: {
      securitySchemes: {
        workspaceKey: {
          type: "http",
          scheme: "bearer",
          description: "A workspace API key created in Settings.",
        },
      },
    },
    paths: {
      ...(config.operations.some(
        (op) => op === "get_workspace" || op === "rename_workspace"
      )
        ? {
            "/api/v1/workspace": {
              ...(config.operations.includes("get_workspace")
                ? {
                    get: {
                      operationId: "get_workspace",
                      summary: operations.get_workspace.title,
                      responses: {
                        ...response(
                          z.object({ data: operations.get_workspace.output })
                        ),
                        "404": { description: "Workspace unavailable" },
                      },
                    },
                  }
                : {}),
              ...(config.operations.includes("rename_workspace")
                ? {
                    patch: {
                      operationId: "rename_workspace",
                      summary: operations.rename_workspace.title,
                      requestBody: {
                        required: true,
                        content: {
                          "application/json": {
                            schema: schema(operations.rename_workspace.input),
                          },
                        },
                      },
                      responses: {
                        ...response(
                          z.object({ data: operations.rename_workspace.output })
                        ),
                        "400": { description: "Invalid name or JSON" },
                        "409": { description: "Workspace update unavailable" },
                        "413": { description: "Body larger than 2048 bytes" },
                      },
                    },
                  }
                : {}),
            },
          }
        : {}),
    },
  })
}
