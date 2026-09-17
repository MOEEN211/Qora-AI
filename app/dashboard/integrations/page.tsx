import { getIntegrations } from "@/lib/integrations/settings"
import { IntegrationsPage } from "@/components/integrations/integrations-page"

export const metadata = { title: "Integrations" }
export default async function Integrations({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const data = await getIntegrations()
  const initialTab = tab === "mcp" ? "mcp" : "api-keys"
  return (
    <IntegrationsPage
      key={`${data.workspaceId}-${initialTab}`}
      {...data}
      initialTab={initialTab}
    />
  )
}
