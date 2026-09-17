"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Bell, Check, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNotifications } from "./notification-provider"
import { notificationDate, type Notification } from "@/lib/notifications"

export function NotificationInbox({
  items,
  page,
  hasMore,
  error,
}: {
  items: Notification[]
  page: number
  hasMore: boolean
  error?: string
}) {
  const inbox = useNotifications()
  const router = useRouter()
  const [transitioning, startTransition] = useTransition()
  function markRead(id: string | null) {
    startTransition(async () => {
      if (await inbox.markRead(id)) router.refresh()
    })
  }
  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your updates, all in one place.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!inbox.unread || inbox.pending || transitioning}
          onClick={() => markRead(null)}
        >
          <CheckCheck /> Mark all as read
        </Button>
      </div>
      {(error || inbox.error) && (
        <div className="mb-4 rounded-lg border p-4">
          <p role="alert" className="text-sm text-destructive">
            {error || inbox.error}
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              void inbox.refresh()
              router.refresh()
            }}
          >
            Try again
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-background">
        {items.map((item) => (
          <article
            key={item.id}
            id={`notification-${item.id}`}
            aria-label={item.title}
            className={`flex scroll-mt-6 gap-4 border-b p-5 last:border-0 target:bg-muted/60 sm:p-6 ${!item.read_at ? "bg-muted/30" : ""}`}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background">
              <Bell className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium break-words">
                  {item.title}
                </h2>
                {!item.read_at && (
                  <span
                    aria-label="Unread"
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                  />
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground">
                {item.body}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <time
                  dateTime={item.created_at}
                  className="text-xs text-muted-foreground"
                >
                  {notificationDate(item.created_at)}
                </time>
                {item.read_at ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="size-3" /> Read
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={inbox.pending || transitioning}
                    onClick={() => markRead(item.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
        {!items.length && !error && (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto mb-4 size-6 text-muted-foreground" />
            <h2 className="text-sm font-medium">
              {page ? "No more notifications" : "No notifications yet"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {page
                ? "Go back to see your recent updates."
                : "Your updates will appear here when there’s something new."}
            </p>
          </div>
        )}
      </div>
      {(page > 0 || hasMore) && (
        <nav
          aria-label="Notification pages"
          className="mt-5 flex items-center justify-between text-sm"
        >
          {page > 0 ? (
            <Link
              className="rounded px-2 py-1 hover:bg-muted"
              href={`/dashboard/notifications?page=${page - 1}`}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          {hasMore ? (
            <Link
              className="rounded px-2 py-1 hover:bg-muted"
              href={`/dashboard/notifications?page=${page + 1}`}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  )
}
