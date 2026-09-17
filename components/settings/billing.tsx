"use client"

import { useState, useTransition } from "react"
import {
  ArrowUpRight,
  Loader2,
  RefreshCw,
  CalendarDays,
} from "lucide-react"
import {
  openBillingPortal,
  openCheckout,
  refreshBilling,
} from "@/app/actions/billing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Feedback } from "./shared"
import {
  BillingInterval,
  PlanCard,
  money,
} from "@/components/billing/plan-card"
import { billingDisplayCatalog } from "@/lib/billing/catalog"
import type { ActionState } from "@/lib/form-state"
import type { BillingData } from "@/lib/billing/types"

export function Billing({ data }: { data: BillingData }) {
  const [interval, setInterval] = useState<"month" | "year">(
    data.snapshot.interval === "year" ? "year" : "month"
  )
  const [state, setState] = useState<ActionState>({})
  const [pending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState("")
  function run(
    action: string,
    work: () => Promise<ActionState & { url?: string }>
  ) {
    setState({})
    setPendingAction(action)
    startTransition(async () => {
      try {
        const result = await work()
        if (result.url) window.location.assign(result.url)
        else setState(result)
      } catch {
        setState({ error: "We couldn't reach billing. Please try again." })
      }
    })
  }
  const current = data.snapshot
  const subscribed = !["none", "canceled", "incomplete_expired"].includes(
    current.status
  )
  const catalog = billingDisplayCatalog(data)
  const canOpenPortal = data.ready && data.customer && data.canManage
  const date = current.period_end
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(current.period_end * 1000)
    : null
  const status = current.cancel_at_period_end
    ? "Cancellation scheduled"
    : current.paid
      ? "Active"
      : subscribed
        ? current.status.replaceAll("_", " ")
        : "Not subscribed"
  const portal = (action: string) =>
    run(action, () => openBillingPortal(data.workspaceId))

  if (!data.canManage)
    return (
      <section className="rounded-xl border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Workspace subscription</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Only workspace owners and admins can view and manage billing.
        </p>
      </section>
    )

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="subscription-heading"
        className="overflow-hidden rounded-xl border bg-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-6 sm:px-8">
          <div>
            <h2 id="subscription-heading" className="text-lg font-semibold">
              Workspace subscription
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Plans and payments for{" "}
              <span className="font-medium text-foreground">
                {data.workspace}
              </span>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.ready && data.mode === "test" && (
              <Badge variant="outline">Test mode</Badge>
            )}
            <Badge variant="secondary" className="capitalize">
              {status}
            </Badge>
          </div>
        </div>
        <div className="grid border-t sm:grid-cols-[1fr_auto]">
          <div className="bg-muted/30 p-6 sm:px-8">
            <p className="text-xs font-medium text-muted-foreground">
              Current plan
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-semibold tracking-tight">
                {subscribed
                  ? current.name || "Your subscription"
                  : "No plan yet"}
              </p>
              {subscribed && current.amount != null && current.currency && (
                <p className="text-sm text-muted-foreground">
                  {money(current.amount, current.currency)} /{" "}
                  {current.interval === "year" ? "year" : "month"}
                </p>
              )}
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              {date && subscribed ? (
                <>
                  <CalendarDays className="size-4 shrink-0" />
                  {current.cancel_at_period_end
                    ? "Access ends"
                    : "Current period ends"}{" "}
                  {date}
                </>
              ) : (
                "Choose a plan below to get started."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-6 pb-6 sm:p-8">
            {data.customer && (
              <Button
                variant="outline"
                disabled={pending || !canOpenPortal}
                onClick={() => portal("manage")}
              >
                Manage subscription
                <ArrowUpRight />
              </Button>
            )}
            {data.ready && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run("refresh", () => refreshBilling(data.workspaceId))
                }
              >
                <RefreshCw
                  className={
                    pending && pendingAction === "refresh" ? "animate-spin" : ""
                  }
                />
                Refresh status
              </Button>
            )}
          </div>
        </div>
      </section>

      <Feedback
        state={state.error || state.success ? state : { error: data.error }}
      />

      {!!catalog.length && (
        <section aria-labelledby="plans-heading" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 id="plans-heading" className="text-lg font-semibold">
                Choose your plan
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Simple subscriptions. Each workspace is billed separately.
              </p>
            </div>
            <BillingInterval value={interval} onChange={setInterval} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {catalog.map((plan) => {
              const price = plan.prices.find((p) => p.interval === interval)
              const active =
                subscribed &&
                current.plan === plan.key &&
                current.interval === interval
              const action = `plan-${plan.key}`
              return (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  interval={interval}
                  active={active}
                  badge={
                    active ? (
                      <Badge variant="secondary">Current plan</Badge>
                    ) : undefined
                  }
                >
                  <Button
                    className="mt-6 w-full"
                    variant={plan.key === "pro" ? "default" : "outline"}
                    disabled={pending || !data.ready || !price?.id || active}
                    onClick={() =>
                      run(
                        action,
                        subscribed
                          ? () => openBillingPortal(data.workspaceId)
                          : () =>
                              openCheckout(data.workspaceId, plan.key, interval)
                      )
                    }
                  >
                    {pending && pendingAction === action && (
                      <Loader2 className="animate-spin" />
                    )}
                    {active
                      ? "Current plan"
                      : subscribed
                        ? `Switch to ${plan.name}`
                        : `Choose ${plan.name}`}
                  </Button>
                </PlanCard>
              )
            })}
          </div>
          {!data.ready && (
            <p role="status" className="text-sm text-muted-foreground">
              Explore the plans above. Subscriptions will be available soon.
            </p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Cancellation takes effect at the end of your paid period.
          </p>
        </section>
      )}
    </div>
  )
}
