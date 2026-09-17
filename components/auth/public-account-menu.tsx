"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { LayoutDashboard, LogOut, Settings2, UserRound } from "lucide-react"
import { signOut } from "@/app/actions/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type PublicAccount = {
  name: string
  email: string
  avatarUrl: string | null
}

export function PublicAccountMenu({ account }: { account: PublicAccount }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <div className="relative shrink-0">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={pending ? "Signing out" : "Account menu"}
          disabled={pending}
          className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Avatar className="size-9">
            <AvatarImage
              src={account.avatarUrl || undefined}
              alt="Your profile photo"
            />
            <AvatarFallback>
              <UserRound className="size-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={12}
          className="w-64 max-w-[calc(100vw-2rem)] rounded-xl p-1.5 shadow-lg"
        >
          <div className="px-2.5 py-3">
            <p className="truncate text-sm font-medium">{account.name}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {account.email}
            </p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href="/dashboard" />}
            className="min-h-10"
          >
            <LayoutDashboard /> Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/dashboard/account" />}
            className="min-h-10"
          >
            <Settings2 /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-10"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError("")
                try {
                  await signOut()
                } catch {
                  setError("Sign out couldn't be completed. Please try again.")
                }
              })
            }
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p
          role="alert"
          className="absolute top-12 right-0 z-50 w-64 rounded-lg border bg-background p-3 text-sm text-destructive shadow-md"
        >
          {error}
        </p>
      )}
    </div>
  )
}
