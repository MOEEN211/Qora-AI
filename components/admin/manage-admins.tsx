"use client"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
type Operator = { id: string; name: string; email: string; created_at: string; is_me: boolean }
type Event = { id: string; action: string; source: string; created_at: string }
export function ManageAdmins({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Operator[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [email, setEmail] = useState("")
  const [removing, setRemoving] = useState<Operator | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  async function load() {
    const response = await fetch("/api/admin", { cache: "no-store" }); const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    setRows(data.rows); setEvents(data.events); setLoading(false)
  }
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error()
      setRows(data.rows); setEvents(data.events); setLoading(false)
    }).catch(() => { if (!controller.signal.aborted) { setError("Admins could not be loaded. Reopen this dialog to retry."); setLoading(false) } })
    return () => controller.abort()
  }, [])
  async function change(address: string, grant: boolean) {
    setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address, grant }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error)
      // Hard navigation clears private rendered data and the client router cache after revocation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (data.selfRemoved) { window.location.assign("/dashboard"); return }
      setEmail(""); setRemoving(null); setMessage(grant ? "Admin added. They can sign in at /admin." : "Admin access removed.")
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again.") } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Manage admins</DialogTitle><DialogDescription>Every admin has the same access. Add an existing, confirmed account.</DialogDescription></DialogHeader>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void change(email, true) }}><Input type="email" aria-label="New admin email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /><Button type="submit" disabled={busy || loading}>Add admin</Button></form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message} <button className="underline" onClick={() => navigator.clipboard.writeText(`${location.origin}/admin`).then(() => setMessage("Admin link copied."))}>Copy admin link</button></p>}
    {loading ? <p className="text-sm text-muted-foreground">Loading admins…</p> : <ul className="divide-y">{rows.map(row => <li key={row.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.name || row.email}{row.is_me && " · You"}</p><p className="truncate text-xs text-muted-foreground">{row.email}</p><p className="text-xs text-muted-foreground">Added {new Date(row.created_at).toLocaleDateString()}</p></div><Button variant="outline" size="sm" disabled={busy || rows.length < 2} onClick={() => setRemoving(row)}>Remove</Button></li>)}</ul>}
    {rows.length === 1 && <p className="text-xs text-muted-foreground">Add another admin before removing the last admin.</p>}
    {removing && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm">Remove admin access for <strong>{removing.email}</strong>?</p><div className="flex gap-2"><Button variant="destructive" disabled={busy} onClick={() => change(removing.email, false)}>Confirm removal</Button><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button></div></div>}
    <details><summary className="cursor-pointer text-sm">Recent access changes</summary><ul className="mt-2 space-y-2">{events.map(event => <li key={event.id} className="text-xs text-muted-foreground">{event.action === "grant" ? "Admin added" : "Admin removed"} · {event.source} · {new Date(event.created_at).toLocaleString()}</li>)}</ul></details>
  </DialogContent></Dialog>
}
