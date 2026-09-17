import "server-only"
import { requireUser } from "@/lib/auth"
import {
  notificationColumns,
  type NotificationSummary,
} from "@/lib/notifications"

export async function getNotificationSummary(): Promise<NotificationSummary> {
  const { user, supabase } = await requireUser()
  const [items, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select(notificationColumns)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ])
  if (items.error || unread.error)
    return {
      items: [],
      unread: 0,
      error: "Notifications couldn’t be loaded. Please try again.",
    }
  return { items: items.data, unread: unread.count ?? 0 }
}
