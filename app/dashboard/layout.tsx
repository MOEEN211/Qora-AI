import { getWorkspace } from "@/lib/auth"
import { AppShell } from "@/components/dashboard/app-shell"
import { NotificationProvider } from "@/components/notifications/notification-provider"
import { getNotificationSummary } from "@/lib/notifications-server"
import { getWorkspacePlanLabel } from "@/lib/billing/plan-label"
import { getOnboarding } from "@/lib/onboarding-server"
import { redirect } from "next/navigation"
import { operatorStatus } from "@/lib/admin/server"
import { AppActivity } from "@/components/admin/activity"
export const dynamic = "force-dynamic"
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if ((await getOnboarding()).status === "in_progress") redirect("/onboarding")
  const [
    { user, profile, organization, avatarUrl, workspaces },
    notifications,
    planLabel,
    operator,
  ] = await Promise.all([
    getWorkspace(),
    getNotificationSummary(),
    getWorkspacePlanLabel(),
    operatorStatus().then(state => state.eligible).catch(() => false),
  ])
  return (
    <NotificationProvider key={user.id} initial={notifications}>
      <AppShell
        operator={operator}
        aiEnabled={process.env.AI_ENABLED === "true"}
        name={profile.full_name}
        email={user.email || ""}
        workspace={organization.name}
        workspaceId={organization.id}
        workspaces={workspaces}
        avatarUrl={avatarUrl}
        planLabel={planLabel}
      >
        <AppActivity workspaceId={organization.id} />
        <div key={organization.id}>{children}</div>
      </AppShell>
    </NotificationProvider>
  )
}
