"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowRight, Bell, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useNotifications } from "./notification-provider"

export function NotificationBell() {
  const inbox = useNotifications()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [transitioning, startTransition] = useTransition()
  const disabled = inbox.pending || transitioning
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) void inbox.refresh()
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
          />
        }
        aria-label={
          inbox.unread
            ? `Notifications, ${inbox.unread} unread`
            : "Notifications"
        }
      >
        <Bell className="size-4" />
        {inbox.unread > 0 && (
          <span
            data-unread-dot
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(380px,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <PopoverTitle>Notifications</PopoverTitle>
          <Button
            variant="ghost"
            size="xs"
            disabled={!inbox.unread || disabled}
            onClick={() =>
              startTransition(async () => {
                if (await inbox.markRead(null)) router.refresh()
              })
            }
          >
            <CheckCheck /> Mark all as read
          </Button>
        </div>
        {inbox.error && (
          <div className="border-b p-4">
            <p role="alert" className="text-xs text-destructive">
              {inbox.error}
            </p>
            <Button
              variant="link"
              size="xs"
              onClick={() => void inbox.refresh()}
            >
              Try again
            </Button>
          </div>
        )}
        <div className="max-h-80 overflow-y-auto">
          {inbox.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              className={`flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${!item.read_at ? "bg-muted/40" : ""}`}
              onClick={() =>
                startTransition(async () => {
                  if (!item.read_at) await inbox.markRead(item.id)
                  setOpen(false)
                  router.push(
                    `/dashboard/notifications#notification-${item.id}`
                  )
                  router.refresh()
                })
              }
            >
              <span className="mt-1.5 flex size-2 shrink-0 items-center">
                {!item.read_at && (
                  <span
                    aria-label="Unread"
                    className="size-1.5 rounded-full bg-primary"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.title}
                </span>
                <span className="mt-1 block truncate text-xs leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </span>
            </button>
          ))}
          {!inbox.items.length && !inbox.error && (
            <div className="px-6 py-10 text-center">
              <Bell className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your updates will appear here.
              </p>
            </div>
          )}
        </div>
        <Link
          href="/dashboard/notifications"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-2 border-t px-4 py-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          View all notifications <ArrowRight className="size-3" />
        </Link>
      </PopoverContent>
    </Popover>
  )
}
