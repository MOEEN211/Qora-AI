"use client"
import { Button } from "@/components/ui/button"
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-semibold">
        We couldn&apos;t open your workspace.
      </h1>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        Try again in a moment. If this keeps happening, contact your workspace
        owner.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
