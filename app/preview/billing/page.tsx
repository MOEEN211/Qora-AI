import { notFound } from "next/navigation"
import seed from "@/config/billing-seed.json"
import { Billing } from "@/components/settings/billing"

export default async function BillingPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { state } = await searchParams
  const subscribed = state === "active" || state === "canceling"
  const plan = seed.plans.find((plan) => plan.key === "pro")!
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 sm:p-10">
      <p className="text-sm text-muted-foreground">
        Development preview · sample plans · payments disabled
      </p>
      <Billing
        data={{
          workspace: "Acme",
          workspaceId: "preview",
          canManage: state !== "member",
          ready: false,
          mode: "test",
          customer: subscribed,
          snapshot: subscribed
            ? {
                status: "active",
                paid: true,
                name: plan.name,
                plan: plan.key,
                amount: plan.year,
                currency: seed.currency,
                interval: "year",
                period_end: 1893456000,
                cancel_at_period_end: state === "canceling",
              }
            : { status: "none", paid: false },
          catalog: [],
        }}
      />
    </main>
  )
}
