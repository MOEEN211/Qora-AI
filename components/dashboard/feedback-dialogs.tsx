"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowUp, Check, Lightbulb, Search } from "lucide-react"
import { submitFeedback, setFeatureVote } from "@/app/actions/feedback"
import type { FeaturePage, FeatureRequest } from "@/lib/feedback"
import type { ActionState } from "@/lib/form-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function FeedbackForm({
  kind,
  workspaceId,
  onSaved,
  onCancel,
  preview,
}: {
  kind: "bug" | "feature"
  workspaceId?: string
  onSaved: (message: string) => void
  onCancel?: () => void
  preview: boolean
}) {
  const id = useRef<string | null>(null)
  const [state, setState] = useState<ActionState>({})
  const [pending, startTransition] = useTransition()
  return (
    <form
      aria-label={kind === "bug" ? "Bug report" : "Submit a feature request"}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        const element = event.currentTarget
        const form = new FormData(element)
        id.current ??= crypto.randomUUID()
        startTransition(async () => {
          setState({})
          try {
            const result = await submitFeedback({
              workspaceId,
              kind,
              id: id.current,
              title: form.get("title"),
              description: form.get("description"),
            })
            setState(result)
            if (result.success) {
              element.reset()
              id.current = null
              onSaved(result.success)
            }
          } catch {
            setState({
              error: "Your submission couldn't be confirmed. Please try again.",
            })
          }
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${kind}-title`}>Title</Label>
        <Input
          id={`${kind}-title`}
          name="title"
          minLength={3}
          maxLength={120}
          required
          disabled={pending}
          placeholder={
            kind === "bug"
              ? "A short summary of the issue"
              : "What would you like us to build?"
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${kind}-description`}>
          {kind === "bug" ? "What happened?" : "Details"}
        </Label>
        <Textarea
          id={`${kind}-description`}
          name="description"
          minLength={10}
          maxLength={5000}
          required
          disabled={pending}
          className="min-h-36 resize-y"
          placeholder={
            kind === "bug"
              ? "Steps to reproduce, what you expected, and what happened instead…"
              : "Describe your idea and how it would help you…"
          }
        />
        <p className="text-xs text-muted-foreground">
          {kind === "bug"
            ? "Only the app team receives your report. Please leave out passwords and other sensitive information."
            : "Your request will be visible to all signed-in customers. Please keep private workspace information out."}
        </p>
      </div>
      {preview && (
        <p role="status" className="text-sm text-muted-foreground">
          Sign in to your connected project to submit feedback.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {kind === "feature" && state.success && (
        <p role="status" className="flex items-start gap-2 text-sm">
          <Check className="size-4 shrink-0" />
          {state.success}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending || preview}>
          {pending
            ? "Submitting…"
            : kind === "bug"
              ? "Submit bug report"
              : "Submit feature request"}
        </Button>
      </div>
    </form>
  )
}

function FeatureCard({
  item,
  onVoted,
}: {
  item: FeatureRequest
  onVoted: (id: string, votes: number, voted: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <article className="flex items-start gap-4 rounded-lg border p-4">
      <Button
        variant={item.voted ? "secondary" : "outline"}
        className="h-auto min-w-12 shrink-0 flex-col gap-0.5 px-2 py-2"
        aria-label={`${item.voted ? "Remove vote for" : "Upvote"} ${item.title}`}
        aria-pressed={item.voted}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("")
            try {
              const result = await setFeatureVote(item.id, !item.voted)
              if (result.error) setError(result.error)
              else if (result.votes !== undefined && result.voted !== undefined)
                onVoted(item.id, result.votes, result.voted)
            } catch {
              setError("Your vote couldn't be confirmed. Please try again.")
            }
          })
        }
      >
        <ArrowUp className="size-4" />
        <span>{item.votes}</span>
      </Button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="font-medium [overflow-wrap:anywhere]">{item.title}</h3>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
          {item.description}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </article>
  )
}

function FeatureBoard({ preview }: { preview: boolean }) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<{
    key: string
    data?: FeaturePage
    error?: string
  } | null>(null)
  const key = `${query}:${page}:${reload}`
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/feedback/features?q=${encodeURIComponent(query)}&page=${page}`,
          { signal: controller.signal, cache: "no-store" }
        )
        const data = await response.json()
        if (!controller.signal.aborted)
          setResult(response.ok ? { key, data } : { key, error: data.error })
      } catch {
        if (!controller.signal.aborted)
          setResult({
            key,
            error: "Feature requests couldn't be loaded. Please try again.",
          })
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, page, reload, key, preview])
  const current = result?.key === key ? result : null
  const data = current?.data
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          aria-label="Search feature requests"
          placeholder="Search ideas before adding your own…"
          className="pl-9"
          maxLength={100}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
        />
      </div>
      {preview ? (
        <p role="status" className="py-10 text-center text-muted-foreground">
          Sign in to view your customer feature board.
        </p>
      ) : !current ? (
        <p role="status" className="py-10 text-center text-muted-foreground">
          Loading feature requests…
        </p>
      ) : current.error ? (
        <div className="space-y-3 py-6 text-center">
          <p role="alert" className="text-destructive">
            {current.error}
          </p>
          <Button
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="space-y-2 py-10 text-center">
          <Lightbulb className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="font-medium">
            {query ? "No matching requests" : "What should we build next?"}
          </p>
          <p className="text-sm text-muted-foreground">
            {query
              ? "Try another search or submit your idea."
              : "Be the first to share an idea with the community."}
          </p>
        </div>
      ) : (
        <div className="max-h-[35svh] space-y-3 overflow-y-auto md:max-h-[calc(85svh-16rem)]">
          {data?.items.map((item) => (
            <FeatureCard
              key={item.id}
              item={item}
              onVoted={(id, votes, voted) => {
                setResult((previous) =>
                  previous?.data
                    ? {
                        ...previous,
                        data: {
                          ...previous.data,
                          items: previous.data.items.map((row) =>
                            row.id === id ? { ...row, votes, voted } : row
                          ),
                        },
                      }
                    : previous
                )
              }}
            />
          ))}
        </div>
      )}
      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span>
            {data.total} {data.total === 1 ? "request" : "requests"} · Newest
            first
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(page + 1) * 20 >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function FeedbackDialog({
  kind,
  workspaceId,
  onClose,
  preview,
  returnFocus,
}: {
  kind: "bug" | "feature"
  onClose: () => void
  preview: boolean
  returnFocus: React.RefObject<HTMLButtonElement | null>
  workspaceId?: string
}) {
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        className={`max-h-[85svh] overflow-y-auto ${kind === "feature" ? "sm:max-w-5xl" : "sm:max-w-xl"}`}
      >
        <DialogHeader className="pr-7">
          <DialogTitle>
            {kind === "bug" ? "Report a bug" : "Feature requests"}
          </DialogTitle>
          <DialogDescription>
            {kind === "bug"
              ? "Something not working as expected? Let us know."
              : "Share ideas, explore requests, and vote for what matters to you."}
          </DialogDescription>
        </DialogHeader>
        {kind === "bug" && notice ? (
          <div className="space-y-5">
            <p role="status" className="flex items-start gap-2">
              <Check className="size-5 shrink-0" />
              {notice}
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : kind === "bug" ? (
          <FeedbackForm
            workspaceId={workspaceId}
            kind={kind}
            preview={preview}
            onCancel={onClose}
            onSaved={setNotice}
          />
        ) : (
          <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section
              aria-label="Requested features"
              className="min-w-0 space-y-4"
            >
              <h3 className="font-medium">Requested features</h3>
              <FeatureBoard key={revision} preview={preview} />
            </section>
            <section
              aria-label="Suggest a feature"
              className="min-w-0 space-y-4 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6"
            >
              <h3 className="font-medium">Suggest a feature</h3>
              <FeedbackForm
                workspaceId={workspaceId}
                kind="feature"
                preview={preview}
                onSaved={() => setRevision((value) => value + 1)}
              />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
