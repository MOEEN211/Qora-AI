"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { markNotificationsRead } from "@/app/actions/notifications"
import type { NotificationSummary } from "@/lib/notifications"

type InboxContext = NotificationSummary & {
  pending: boolean
  refresh: () => Promise<void>
  markRead: (id: string | null) => Promise<boolean>
}
const Context = createContext<InboxContext | null>(null)

export function NotificationProvider({
  initial,
  children,
}: {
  initial: NotificationSummary
  children: React.ReactNode
}) {
  const [inbox, setInbox] = useState(initial)
  const [pending, setPending] = useState(false)
  const revision = useRef(0)
  const busy = useRef(false)
  const refresh = useCallback(async () => {
    if (busy.current) return
    const current = ++revision.current
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" })
      if (!response.ok) throw new Error("Unavailable")
      const result: NotificationSummary = await response.json()
      if (revision.current === current) setInbox(result)
    } catch {
      if (revision.current === current)
        setInbox((previous) => ({
          ...previous,
          error: "Notifications couldn’t be refreshed. Please try again.",
        }))
    }
  }, [])

  useEffect(() => {
    const requests = revision
    const update = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    const interval = window.setInterval(update, 60_000)
    return () => {
      ++requests.current
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", update)
      window.clearInterval(interval)
    }
  }, [refresh])

  async function markRead(id: string | null) {
    if (busy.current) return false
    busy.current = true
    ++revision.current // A read started before this write must not restore unread state.
    setPending(true)
    try {
      const result = await markNotificationsRead(id)
      if (result.error || !result.readAt) throw new Error("Unavailable")
      setInbox((previous) => ({
        items: previous.items.map((item) =>
          !item.read_at && (!id || item.id === id)
            ? { ...item, read_at: result.readAt! }
            : item
        ),
        unread: id
          ? Math.max(
              0,
              previous.unread -
                (previous.items.some((item) => item.id === id && !item.read_at)
                  ? 1
                  : 0)
            )
          : 0,
      }))
      busy.current = false
      await refresh()
      return true
    } catch {
      setInbox((previous) => ({
        ...previous,
        error: "Notifications couldn’t be marked as read. Please try again.",
      }))
      return false
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <Context.Provider value={{ ...inbox, pending, refresh, markRead }}>
      {children}
    </Context.Provider>
  )
}

export function useNotifications() {
  const context = useContext(Context)
  if (!context) throw new Error("NotificationProvider is required")
  return context
}
