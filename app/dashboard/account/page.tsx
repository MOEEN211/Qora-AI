import { redirect } from "next/navigation"
import { getSettings } from "@/lib/settings"
import { SettingsPage } from "@/components/settings/settings-page"

export const metadata = { title: "Settings" }
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  if (tab === "api-keys" || tab === "api") redirect("/dashboard/integrations")
  if (tab === "mcp") redirect("/dashboard/integrations?tab=mcp")
  const settings = await getSettings()
  return (
    <SettingsPage
      key={`${settings.workspaceId}-${tab || "general"}`}
      {...settings}
      initialTab={
        ["general", "security", "notifications", "billing"].includes(tab || "")
          ? tab
          : "general"
      }
    />
  )
}
