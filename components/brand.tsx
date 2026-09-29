import Link from "next/link"
import { site } from "@/config/site"
export function Brand({
  href = "/",
  compact = false,
  collapsible = false,
}: {
  href?: string
  compact?: boolean
  collapsible?: boolean
}) {
  const brandName = site.name && site.name !== "Forma" ? site.name : "Qora.ai"
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 font-semibold tracking-tight"
      aria-label={`${brandName} home`}
    >
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && (
        <span
          data-sidebar-label={collapsible ? "" : undefined}
          className="text-xl font-bold tracking-tight"
        >
          {brandName}
        </span>
      )}
    </Link>
  )
}
