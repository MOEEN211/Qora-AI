import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { optionalUser } from "@/lib/auth"
import { operatorStatus } from "@/lib/admin/server"
import { billingMode } from "@/lib/billing/environment.mjs"
import { AdminShell } from "@/components/admin/shell"
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } }
export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!await optionalUser()) redirect("/admin/sign-in")
  const state = await operatorStatus()
  if (!state.eligible) return <main className="mx-auto max-w-lg space-y-4 px-6 py-24"><h1 className="text-2xl font-semibold">Admin access required</h1><p className="text-muted-foreground">This account does not have access to administration.</p><Link href="/dashboard" className="underline">Back to app</Link></main>
  return <AdminShell email={state.user.email || "Admin"} mode={billingMode()}>{children}</AdminShell>
}
