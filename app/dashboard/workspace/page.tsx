import { getWorkspaceTeam } from "@/lib/workspaces"
import { WorkspacePage } from "@/components/workspaces/workspace-page"

export const metadata = { title: "Workspace" }
export default async function Workspace() {
  const data = await getWorkspaceTeam()
  return <WorkspacePage key={data.workspace.id} {...data} />
}
