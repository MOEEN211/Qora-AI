"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { openInvitationLink } from "@/app/actions/workspaces"

// Fragments never reach request/access logs. Exchange only through the POST body
// for an HTTP-only cookie, then erase the fragment from browser history.
export function InvitationLink({
  hasContext = false,
}: {
  hasContext?: boolean
}) {
  const started = useRef(false)
  const router = useRouter()
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token"
    )
    window.history.replaceState(null, "", "/invite")
    if (!token) return
    openInvitationLink(token)
      .then((result) => {
        if (result.error) setMessage(result.error)
        else router.refresh()
      })
      .catch(() =>
        setMessage(
          "The invitation could not be opened. Try the link in your email again."
        )
      )
  }, [router, hasContext])
  if (hasContext) return message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Workspace invitation</h1>
      <p role="status" className="text-sm text-muted-foreground">
        {message || "Open the invitation link from your email. If it no longer works, ask a workspace owner or admin for a new one."}
      </p>
    </div>
  )
}
