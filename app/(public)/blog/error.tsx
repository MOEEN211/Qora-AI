"use client"
import { Button } from "@/components/ui/button"
export default function BlogError({ reset }: { reset: () => void }) {
  return (
    <div className="marketing-container journal-empty" role="alert">
      <h1>The journal is temporarily unavailable.</h1>
      <p>Please try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
