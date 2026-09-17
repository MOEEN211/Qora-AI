"use client"
import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ApiKeys } from "./api-keys"
import { IntegrationConnections } from "./connections"
import type { IntegrationsProps } from "./types"
import { DocumentationButton } from "./documentation-button"

export function IntegrationsPage(props: IntegrationsProps) {
  const [tab, setTab] = useState(props.initialTab || "api-keys")
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Connect your tools and AI assistants to {props.workspace}.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="gap-8">
        <div className="flex items-center justify-between gap-3">
          <TabsList aria-label="Integrations sections" className="shrink-0">
            <TabsTrigger value="api-keys">API keys</TabsTrigger>
            <TabsTrigger value="mcp">MCP</TabsTrigger>
          </TabsList>
          <DocumentationButton surface={tab === "mcp" ? "mcp" : "api"} />
        </div>
        <TabsContent value="api-keys" className="min-w-0 space-y-6">
          {props.keysUnavailable ? (
            <p role="status" className="text-sm text-muted-foreground">
              API keys are temporarily unavailable. Refresh to try again.
            </p>
          ) : (
            <ApiKeys {...props} />
          )}
        </TabsContent>
        <TabsContent value="mcp" className="min-w-0">
          <IntegrationConnections
            apiUrl={props.apiUrl}
            connections={props.connections}
            unavailable={props.connectionsUnavailable}
            canManage={props.canManageKeys}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
