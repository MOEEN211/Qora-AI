import Link from "next/link"
import { notFound } from "next/navigation"
import { optionalUser } from "@/lib/auth"
import { adminRead, operatorStatus } from "@/lib/admin/server"
import { AdminFilters, ReportTable, Overview, Detail, UsageSummary } from "@/components/admin/report"
const titles: Record<string, [string, string]> = {
  overview: ["Overview", "A view of your customers, workspaces and recurring business."],
  users: ["Users", "Accounts, memberships and onboarding information."],
  workspaces: ["Workspaces", "Your customers' workspaces and teams."],
  subscriptions: ["Subscriptions", "Read-only billing state from your synchronized Stripe records."],
  usage: ["AI usage", "Workspace credits, request totals and recorded provider costs."],
  feedback: ["Feedback", "Bug reports and feature requests from your customers."],
}
export default async function Page({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await optionalUser()) return null
  const state = await operatorStatus(); if (!state.verified) return null
  const { path = [] } = await params; const section = path[0] || "overview"; const id = path[1]
  if (!titles[section] || path.length > 2 || (id && !["users", "workspaces"].includes(section)) || (id && !/^[a-f0-9-]{36}$/.test(id))) notFound()
  const raw = await searchParams; const options: Record<string, string> = {}
  for (const key of ["q", "days", "page", "status", "category", "sort", "tab", "workspace", "dated", "interval", "canceling", "active", "cursor", "trail"]) if (typeof raw[key] === "string") options[key] = raw[key] as string
  if (options.days && !["7", "30", "90"].includes(options.days)) options.days = "30"
  if (options.page && (!/^\d{1,3}$/.test(options.page) || Number(options.page) > 400)) options.page = "0"
  if ((options.trail?.length || 0) > 52000) delete options.trail
  if (options.workspace && !/^[a-f0-9-]{36}$/.test(options.workspace)) delete options.workspace
  const querySection = section === "feedback" ? options.tab === "features" ? "features" : "bugs" : section
  let cursor: unknown = undefined
  try { if (options.cursor && options.cursor.length < 512) cursor = JSON.parse(options.cursor) } catch { delete options.cursor }
  const report = await adminRead(querySection, { ...options, cursor, ...(id ? { id } : {}) })
  const [billing, usage] = id && section === "workspaces" ? await Promise.all([adminRead("subscriptions", { workspace: id }), adminRead("usage", { workspace: id })]) : [null, null]
  return <>
    <div>{id && <Link href={`/admin/${section}`} className="mb-3 inline-block text-sm text-muted-foreground">← All {section}</Link>}<h1 className="text-2xl font-semibold tracking-tight">{id ? String(report.rows?.[0]?.name || report.rows?.[0]?.email || "Record unavailable") : titles[section][0]}</h1><p className="mt-2 text-sm text-muted-foreground">{titles[section][1]}</p></div>
    {!id && <AdminFilters key={JSON.stringify(options)} section={querySection} options={options} />}
    {section === "feedback" && <nav aria-label="Feedback types" className="flex w-fit rounded-lg bg-muted p-1 text-sm">{[["bugs", "Bug reports"], ["features", "Feature requests"]].map(([key, label]) => <Link key={key} href={`?tab=${key}`} aria-current={querySection === key ? "page" : undefined} className={`rounded-md px-4 py-2 ${querySection === key ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</Link>)}</nav>}
    {id ? <Detail section={section} report={report} /> : section === "overview" ? <Overview report={report} days={options.days} /> : <>{section === "usage" && <UsageSummary report={report} />}<ReportTable section={querySection} report={report} options={options} /></>}
    {billing && <section className="space-y-4"><h2 className="font-medium">Subscription</h2><ReportTable section="subscriptions" report={billing} /></section>}
    {usage && <section className="space-y-4"><h2 className="font-medium">AI usage</h2><UsageSummary report={usage} /><ReportTable section="usage" report={usage} /></section>}
    {id && section === "workspaces" && <Link href={`/admin/feedback?workspace=${id}`} className="inline-block text-sm underline">View workspace feedback</Link>}
  </>
}
