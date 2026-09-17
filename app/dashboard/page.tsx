import { getWorkspace } from "@/lib/auth"
import { Overview } from "@/components/dashboard/overview"
export const metadata = { title: "Overview" }
export default async function Dashboard() {
  const { user, profile, organization, role, memberCount } =
    await getWorkspace()
  return (
    <Overview
      name={profile.full_name}
      email={user.email || ""}
      workspace={organization.name}
      slug={organization.slug}
      role={role}
      memberCount={memberCount}
      createdAt={organization.created_at}
    />
  )
}
