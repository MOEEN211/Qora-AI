"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, History, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Chat = { id: string; title: string; created_at: string }

export function ChatHistoryDialog({
  workspaceId,
  workspace,
  activeChatId,
  previewChats,
}: {
  workspaceId: string
  workspace: string
  activeChatId?: string
  previewChats?: Chat[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<Chat[]>([])
  const [before, setBefore] = useState<Chat>()
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(
      async () => {
        try {
          let page: Chat[]
          if (previewChats) {
            const matches = previewChats.filter((c) =>
              c.title.toLowerCase().includes(search.trim().toLowerCase())
            )
            const start = before
              ? matches.findIndex((c) => c.id === before.id) + 1
              : 0
            page = matches.slice(start, start + 21)
          } else {
            const params = new URLSearchParams({
              workspaceId,
              operation: "search",
              q: search.trim(),
            })
            if (before) {
              params.set("before", before.created_at)
              params.set("beforeId", before.id)
            }
            const response = await fetch("/api/ai/history?" + params, {
              cache: "no-store",
              signal: controller.signal,
            })
            if (!response.ok)
              throw new Error("History could not load. Please try again.")
            page = await response.json()
          }
          if (controller.signal.aborted) return
          setRows((current) =>
            before ? [...current, ...page.slice(0, 20)] : page.slice(0, 20)
          )
          setMore(page.length > 20)
        } catch {
          if (!controller.signal.aborted)
            setError("History could not load. Please try again.")
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      },
      search ? 250 : 0
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, workspaceId, search, before, previewChats, retry])

  function changeSearch(value: string) {
    setSearch(value)
    setBefore(undefined)
    setRows([])
    setMore(false)
    setError("")
    setLoading(true)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) {
          setBefore(undefined)
          setRows([])
          setError("")
          setLoading(true)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Open chat history"
            className="gap-2 text-muted-foreground"
          />
        }
      >
        <History className="size-4" /> History
      </DialogTrigger>
      <DialogContent
        initialFocus={searchInput}
        className="flex max-h-[min(640px,85dvh)] flex-col gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-xl"
      >
        <div className="px-6 pt-6 pb-5">
          <DialogTitle className="text-xl tracking-tight">
            Pick up where you left off
          </DialogTitle>
          <DialogDescription className="mt-2 pr-5 text-sm">
            Your conversations in {workspace}.
          </DialogDescription>
        </div>
        <div className="mx-5 mb-4 flex items-center gap-3 rounded-xl bg-muted/60 px-3.5 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchInput}
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            maxLength={120}
            aria-label="Search chat history"
            placeholder="Search conversation titles…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => {
                changeSearch("")
                searchInput.current?.focus()
              }}
            >
              <X />
            </Button>
          )}
        </div>
        <div
          className="min-h-36 overflow-y-auto overscroll-contain px-3 pb-3"
          aria-busy={loading}
        >
          <p className="px-3 pt-1 pb-3 text-[11px] font-medium text-muted-foreground">
            {search.trim() ? "Search results" : "Recent conversations"}
          </p>
          {error ? (
            <div
              role="alert"
              className="px-3 py-8 text-center text-sm text-muted-foreground"
            >
              <p>{error}</p>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => {
                  setError("")
                  setLoading(true)
                  setRetry((n) => n + 1)
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <nav aria-label="Conversations" className="space-y-0.5">
              {rows.map((chat) => (
                <Link
                  key={chat.id}
                  href={"/dashboard/chat/" + chat.id}
                  onClick={() => setOpen(false)}
                  aria-current={activeChatId === chat.id ? "page" : undefined}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {chat.title}
                    {activeChatId === chat.id && (
                      <span className="sr-only"> · Current chat</span>
                    )}
                  </span>
                  <time
                    dateTime={chat.created_at}
                    className="shrink-0 text-[11px] text-muted-foreground"
                  >
                    {new Date(chat.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </Link>
              ))}
            </nav>
          )}
          {!loading && !error && !rows.length && (
            <div className="px-4 py-10 text-center">
              <Search className="mx-auto mb-4 size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">
                {search.trim()
                  ? "No conversations found"
                  : "Your next idea starts here"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {search.trim()
                  ? "Try another title or a shorter phrase."
                  : "Start a chat and you’ll find it here."}
              </p>
            </div>
          )}
          {loading && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Searching conversations…
            </div>
          )}
          {more && !loading && !error && (
            <Button
              variant="ghost"
              className="mt-2 w-full text-xs"
              onClick={() => {
                setLoading(true)
                setBefore(rows.at(-1))
              }}
            >
              Load more conversations
            </Button>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-6 py-3 text-[11px] text-muted-foreground">
          <span>Shared with your workspace</span>
          <span>Esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
