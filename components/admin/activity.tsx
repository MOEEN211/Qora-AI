"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
export function AppActivity({ workspaceId }: { workspaceId?: string }) {
  const pathname = usePathname()
  useEffect(() => {
    const controller = new AbortController()
    let retry: ReturnType<typeof setTimeout> | undefined
    let recorded = false
    async function record(attempt = 0) {
      try {
        const response = await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: workspaceId || null }), signal: controller.signal })
        if (!response.ok && attempt < 1) retry = setTimeout(() => record(attempt + 1), 3000)
      } catch { if (!controller.signal.aborted && attempt < 1) retry = setTimeout(() => record(attempt + 1), 3000) }
    }
    function visible() { if (!recorded && document.visibilityState === "visible") { recorded = true; void record() } }
    visible()
    document.addEventListener("visibilitychange", visible)
    return () => { controller.abort(); document.removeEventListener("visibilitychange", visible); if (retry) clearTimeout(retry) }
  }, [workspaceId, pathname])
  return null
}
