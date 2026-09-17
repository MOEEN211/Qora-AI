import { Skeleton } from "@/components/ui/skeleton"
export default function Loading() {
  return (
    <div
      data-dashboard-loading
      className="space-y-6"
      aria-label="Loading workspace"
      role="status"
    >
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-52 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  )
}
