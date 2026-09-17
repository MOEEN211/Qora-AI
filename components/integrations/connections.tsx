"use client"
import { useActionState, useState } from "react"
import Link from "next/link"
import { Copy, Check, Plug } from "lucide-react"
import { disconnectConnection } from "@/app/actions/integrations"
import { Button } from "@/components/ui/button"
import { Feedback } from "@/components/settings/shared"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import config from "@/config/integrations.json"
export type Connection = {
  id: string
  name: string
  workspace: string
  permission: string
  client_id: string
  last_used_at: string | null
  revoked_at?: string | null
}
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <code className="min-w-0 flex-1 text-xs break-all">{value}</code>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={"Copy " + label}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}
function ConnectionRow({ connection }: { connection: Connection }) {
  const [state, action, pending] = useActionState(disconnectConnection, {})
  return (
    <div className="space-y-3 border-t py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{connection.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {connection.workspace} ·{" "}
            {connection.revoked_at
              ? "Access removed"
              : connection.permission === "read"
                ? "Read only"
                : "Read and rename"}
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="connection_id" value={connection.id} />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {connection.revoked_at ? "Finish disconnect" : "Disconnect"}
          </Button>
        </form>
      </div>
      {connection.revoked_at && (
        <p className="text-xs text-muted-foreground">
          Finish disconnecting before connecting this application again.
        </p>
      )}
      <Feedback state={state} />
    </div>
  )
}
export function IntegrationConnections({
  apiUrl,
  connections = [],
  unavailable = false,
  canManage = false,
}: {
  apiUrl: string
  connections?: Connection[]
  unavailable?: boolean
  canManage?: boolean
}) {
  const url = new URL(apiUrl)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4" />
            Connect an AI assistant
          </CardTitle>
          <CardDescription className="max-w-2xl leading-6">
            MCP (Model Context Protocol) lets an AI assistant use your app.
            Connect it to one workspace to read its ID and details, or rename it
            if you give permission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!config.mcpEnabled ? (
            <p className="text-sm text-muted-foreground">
              MCP connections are not available for this application.
            </p>
          ) : (
            <>
              <CopyValue
                label="MCP server URL"
                value={url.origin + "/api/mcp"}
              />
              {local && (
                <div className="space-y-2 rounded-lg bg-muted p-4 text-sm leading-6">
                  <p className="font-medium">
                    To connect Claude, publish your app first
                  </p>
                  <p className="text-muted-foreground">
                    This app is running on your computer. Claude cannot reach
                    the localhost address above. Publish your app online, then
                    copy the MCP URL from the published app. It will start with
                    https://.
                  </p>
                  <p className="text-muted-foreground">
                    You can test the current URL with an MCP client running on
                    this computer. See the{" "}
                    <Link
                      href="/docs/getting-started/setup#deploy"
                      className="underline underline-offset-4"
                    >
                      deployment setup
                    </Link>{" "}
                    for publishing requirements.
                  </p>
                </div>
              )}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">How to connect</h3>
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>
                    {config.oauthEnabled
                      ? "Open your assistant’s connector settings. In Claude, go to Customize → Connectors → Add custom connector."
                      : "Open an MCP client that supports API keys and add a remote MCP server."}
                  </li>
                  <li>
                    {local
                      ? "Paste the MCP server URL. For Claude, use the URL from your published app."
                      : "Paste the MCP server URL shown above."}
                  </li>
                  <li>
                    {config.oauthEnabled
                      ? "Sign in to this app, choose your workspace, and approve Read only or Read and rename access."
                      : "Create a key in the API keys tab. In the client’s authentication settings, enter Bearer followed by a space and your key."}
                  </li>
                </ol>
              </div>
              {config.oauthEnabled && (
                <p className="text-sm leading-6 text-muted-foreground">
                  No API key is needed when you connect by signing in. Clients
                  that use API keys can follow the instructions in the MCP
                  documentation.
                </p>
              )}
              {!canManage && (
                <p className="text-sm text-muted-foreground">
                  A workspace Owner or Admin must authorize new connections. You
                  can still disconnect your existing applications below.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Once connected, try asking: “Show my connected workspace and its
                ID.”
              </p>
            </>
          )}
        </CardContent>
      </Card>
      {config.mcpEnabled && config.oauthEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Connected applications</CardTitle>
            <CardDescription>
              Applications you have authorized across your workspaces.
              Disconnect an application to remove its access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unavailable ? (
              <p role="status" className="text-sm text-muted-foreground">
                Connected applications are temporarily unavailable.
              </p>
            ) : connections.length ? (
              connections.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No applications connected yet. Follow the steps above to connect
                your first assistant.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
