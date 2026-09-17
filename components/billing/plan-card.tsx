import type { ReactNode } from "react"
import { Check } from "lucide-react"
import type { BillingPlan } from "@/lib/billing/types"

export function money(amount: number, currency: string) {
  const digits = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits
  const unit = 10 ** (digits ?? 2)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % unit ? digits : 0,
  }).format(amount / unit)
}

export function BillingInterval({
  value,
  onChange,
}: {
  value: "month" | "year"
  onChange: (value: "month" | "year") => void
}) {
  return (
    <div
      role="group"
      aria-label="Billing interval"
      className="inline-flex shrink-0 rounded-lg bg-muted p-1"
    >
      {(["month", "year"] as const).map((interval) => (
        <button
          key={interval}
          type="button"
          aria-pressed={value === interval}
          onClick={() => onChange(interval)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${value === interval ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {interval === "month" ? "Monthly" : "Yearly"}
        </button>
      ))}
    </div>
  )
}

export function PlanCard({
  plan,
  interval,
  active = false,
  badge,
  children,
}: {
  plan: BillingPlan
  interval: "month" | "year"
  active?: boolean
  badge?: ReactNode
  children: ReactNode
}) {
  const price = plan.prices.find((p) => p.interval === interval)
  const monthly = plan.prices.find((p) => p.interval === "month")
  const savings =
    interval === "year" &&
    price &&
    monthly &&
    price.currency === monthly.currency
      ? monthly.amount * 12 - price.amount
      : 0
  return (
    <article
      aria-label={`${plan.name} plan`}
      className={`flex flex-col rounded-xl border bg-card p-6 ${plan.key === "pro" || active ? "border-foreground/40 ring-1 ring-foreground/10" : ""}`}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="font-semibold">{plan.name}</h3>
        {badge}
      </div>
      <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
        {plan.description}
      </p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {price ? money(price.amount, price.currency) : "Unavailable"}
        </span>
        {price && (
          <span className="text-sm text-muted-foreground">
            / {interval === "month" ? "month" : "year"}
          </span>
        )}
      </div>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground">
        {savings > 0 && price
          ? `Save ${money(savings, price.currency)} per year`
          : interval === "year"
            ? "Billed once a year"
            : "Billed monthly"}
      </p>
      {children}
      <div className="mt-6 border-t pt-5">
        <p className="flex items-center gap-2 text-sm">
          <Check className="size-4 shrink-0 text-muted-foreground" />
          One workspace subscription
        </p>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Check className="size-4 shrink-0 text-muted-foreground" />
          Manage or cancel anytime
        </p>
      </div>
    </article>
  )
}
