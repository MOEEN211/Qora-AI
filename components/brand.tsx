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
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 font-semibold tracking-tight"
      aria-label={`${site.name} home`}
    >
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && <span data-sidebar-label={collapsible ? "" : undefined} className="text-xl">{site.name}</span>}
    </Link>
  )
}
