import { requireUser } from "@/lib/auth"
import { notificationColumns } from "@/lib/notifications"
import { NotificationInbox } from "@/components/notifications/notification-inbox"

export const metadata = { title: "Notifications" }

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { user, supabase } = await requireUser()
  const requested = Number((await searchParams).page ?? 0)
  const page =
    Number.isSafeInteger(requested) && requested >= 0 && requested <= 10000
      ? requested
      : 0
  const { data, error } = await supabase
    .from("notifications")
    .select(notificationColumns)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * 20, page * 20 + 20)
  return (
    <NotificationInbox
      items={data?.slice(0, 20) ?? []}
      page={page}
      hasMore={(data?.length ?? 0) > 20}
      error={
        error
          ? "Notifications couldn’t be loaded. Please try again."
          : undefined
      }
    />
  )
}
