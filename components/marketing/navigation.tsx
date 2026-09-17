"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { ArrowUpRight, Menu, X } from "lucide-react"
import {
  PublicAccountMenu,
  type PublicAccount,
} from "@/components/auth/public-account-menu"

export function MarketingNavigation({
  links,
  account,
}: {
  links: { label: string; href: string }[]
  account: PublicAccount | null
}) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  return (
    <div
      className="marketing-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false)
          toggle.current?.focus()
        }
      }}
    >
      <button
        ref={toggle}
        className="marketing-menu-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="marketing-menu"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav
        id="marketing-menu"
        aria-label="Main navigation"
        className={open ? "marketing-menu is-open" : "marketing-menu"}
      >
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {!account && (
          <Link
            href="/login"
            className="marketing-login"
            onClick={() => setOpen(false)}
          >
            Sign in <ArrowUpRight size={14} />
          </Link>
        )}
      </nav>
      {account && <PublicAccountMenu account={account} />}
    </div>
  )
}
