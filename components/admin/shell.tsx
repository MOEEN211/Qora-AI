"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, ChartNoAxesCombined, Users, Building2, CreditCard, Sparkles, MessageSquare, ChevronsUpDown, ShieldCheck } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { signOut } from "@/app/actions/auth"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ManageAdmins } from "./manage-admins"
import { createClient } from "@/lib/supabase/client"
const nav = [
  ["/admin", "Overview", ChartNoAxesCombined], ["/admin/users", "Users", Users],
  ["/admin/workspaces", "Workspaces", Building2], ["/admin/subscriptions", "Subscriptions", CreditCard],
  ["/admin/usage", "AI usage", Sparkles], ["/admin/feedback", "Feedback", MessageSquare],
] as const
export function AdminShell({ children, email, mode }: { children: React.ReactNode; email: string; mode: string }) {
  const path = usePathname(); const [manage, setManage] = useState(false)
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") window.location.replace("/login") })
    return () => data.subscription.unsubscribe()
  }, [])
  return <div className="min-h-svh bg-background lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
    <aside className="border-b bg-sidebar p-4 lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:border-r lg:border-b-0 lg:p-5">
      <Link href="/admin" className="flex items-center gap-2 px-2 py-3 text-base font-semibold"><ShieldCheck className="size-5" />Administration</Link>
      <nav aria-label="Admin navigation" className="mt-4 flex gap-1 overflow-x-auto lg:flex-col">{nav.map(([href, label, Icon]) => {
        const active = href === "/admin" ? path === href : path.startsWith(href)
        return <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-sidebar-accent font-medium" : "text-muted-foreground hover:bg-sidebar-accent"}`}><Icon className="size-4" />{label}</Link>
      })}</nav>
      <div className="mt-5 space-y-3 lg:mt-auto"><Link href="/dashboard" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Back to app</Link>
        <DropdownMenu><DropdownMenuTrigger aria-label="Admin account menu" className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"><span className="truncate">{email}</span><ChevronsUpDown className="size-4 shrink-0" /></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={() => setManage(true)}>Manage admins</DropdownMenuItem><DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </aside>
    <div className="min-w-0"><header className="flex h-16 items-center justify-between border-b px-5 lg:px-8"><span className="text-sm text-muted-foreground">Admin</span><div className="flex items-center gap-3"><span className="rounded-md border px-2 py-1 text-xs">Stripe {mode}</span><ThemeToggle /></div></header><main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">{children}</main></div>
    {manage && <ManageAdmins onClose={() => setManage(false)} />}
  </div>
}
