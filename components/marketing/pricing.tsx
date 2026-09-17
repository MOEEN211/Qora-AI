"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, LockKeyhole } from "lucide-react"
import { BillingInterval, PlanCard } from "@/components/billing/plan-card"
import type { BillingPlan } from "@/lib/billing/types"

export function Pricing({
  catalog,
  unavailable = false,
}: {
  catalog: BillingPlan[]
  unavailable?: boolean
}) {
  const [interval, setInterval] = useState<"month" | "year">("month")
  return (
    <div className="public-pricing">
      <div className="public-pricing-toolbar">
        <BillingInterval value={interval} onChange={setInterval} />
        <span>One subscription per workspace. No per-seat charges.</span>
      </div>
      {catalog.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {catalog.map((plan) => (
            <PlanCard key={plan.key} plan={plan} interval={interval}>
              {plan.prices.some((price) => price.interval === interval) ? (
                <Link
                  className={`marketing-button mt-6 w-full ${plan.key === "pro" ? "marketing-button-dark" : "marketing-button-light"}`}
                  href="/dashboard/account?tab=billing"
                >
                  Choose {plan.name}
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <span className="mt-6 text-sm text-muted-foreground">
                  This billing interval is unavailable.
                </span>
              )}
            </PlanCard>
          ))}
        </div>
      ) : (
        <p
          role="status"
          className="rounded-xl border p-8 text-center text-muted-foreground"
        >
          {unavailable
            ? "Pricing is temporarily unavailable. Please try again shortly."
            : "Plans will be available soon."}
        </p>
      )}
      <p className="public-pricing-note">
        <LockKeyhole size={13} /> Payments handled by Stripe. Cancellation takes
        effect at the end of your paid period.
      </p>
    </div>
  )
}
