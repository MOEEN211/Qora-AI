"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import {
  BookOpen,
  Bug,
  ChevronsUpDown,
  Lightbulb,
  LogOut,
  Settings2,
  ShieldCheck,
} from "lucide-react"
import { signOut } from "@/app/actions/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FeedbackDialog } from "@/components/dashboard/feedback-dialogs"

export function AccountMenu({
  name,
  email,
  avatarUrl,
  preview,
  workspaceId,
  operator = false,
}: {
  name: string
  email: string
  avatarUrl?: string | null
  preview: boolean
  workspaceId?: string
  operator?: boolean
}) {
  const [dialog, setDialog] = useState<"bug" | "feature" | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const trigger = useRef<HTMLButtonElement>(null)
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "ME"
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-sidebar-row="account"
          ref={trigger}
          aria-label="Account menu"
          disabled={pending}
          title="Account menu"
          className="flex w-full items-center gap-3 rounded-md p-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9">
            <AvatarImage
              src={avatarUrl || undefined}
              alt="Your profile photo"
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span data-sidebar-label className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {pending ? "Signing out…" : email}
            </span>
          </span>
          <ChevronsUpDown
            data-sidebar-label
            className="size-4 shrink-0 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8}>
          {operator && <DropdownMenuItem render={<Link href="/admin" prefetch={false} />}><ShieldCheck />Admin</DropdownMenuItem>}
          <DropdownMenuItem
            render={<Link href={preview ? "/setup" : "/dashboard/account"} />}
          >
            <Settings2 />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/docs" />}>
            <BookOpen />
            Documentation
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("feature")}>
            <Lightbulb />
            Feature request
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("bug")}>
            <Bug />
            Bug report
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={preview || pending}
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
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {dialog && (
        <FeedbackDialog
          workspaceId={workspaceId}
          key={dialog}
          kind={dialog}
          preview={preview}
          onClose={() => setDialog(null)}
          returnFocus={trigger}
        />
      )}
    </>
  )
}
