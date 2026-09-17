export type Notification = {
  id: string
  title: string
  body: string
  created_at: string
  read_at: string | null
}

export type NotificationSummary = {
  items: Notification[]
  unread: number
  error?: string
}

export const notificationColumns = "id,title,body,created_at,read_at"

export function notificationDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value))
}
