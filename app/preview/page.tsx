import { notFound } from "next/navigation"
import { AppShell } from "@/components/dashboard/app-shell"
import { Overview } from "@/components/dashboard/overview"
export const metadata = { title: "Design preview" }
export const dynamic = "force-dynamic"
export default function Preview() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <AppShell
      name="Alex Morgan"
      email="alex@example.com"
      workspace="Alex's workspace"
      preview
    >
      <Overview
        name="Alex Morgan"
        email="alex@example.com"
        workspace="Alex's workspace"
        slug="alexs-workspace"
        role="owner"
        memberCount={1}
        createdAt="2026-09-13T12:00:00Z"
        preview
      />
    </AppShell>
  )
}
