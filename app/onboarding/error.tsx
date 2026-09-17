"use client"

import { Button } from "@/components/ui/button"

export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Onboarding couldn’t load</h1>
      <p className="text-sm text-muted-foreground">
        Please try again. If this keeps happening, contact support to check your
        account setup.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
