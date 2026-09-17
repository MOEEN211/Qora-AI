"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChatHistoryDialog } from "@/components/ai/history-dialog"
import { chatMessageIds } from "@/lib/ai/config.mjs"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  ArrowUp,
  Copy,
  Loader2,
  Lightbulb,
  Rocket,
  Pencil,
  ListChecks,
  Plus,
  RotateCcw,
  Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type ChatRow = { id: string; title: string; created_at: string }
type Turn = {
  id: string
  prompt: string
  output: string
  status: string
  created_at: string
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  credits_charged: number
  is_mine?: boolean
}
type Credits = {
  available: number
  reserved: number
  consumed: number
  allowance: number
}
type Props = {
  workspaceId: string
  workspace: string
  chatId?: string
  chats: ChatRow[]
  turns: Turn[]
  credits: Credits
  preview?: boolean
  enabled: boolean
}
function toMessages(turns: Turn[]): UIMessage[] {
  return [...turns].reverse().flatMap((t) => [
    {
      id: chatMessageIds(t.id).user,
      role: "user" as const,
      parts: [{ type: "text" as const, text: t.prompt }],
    },
    ...(t.output || t.status !== "streaming"
      ? [
          {
            id: chatMessageIds(t.id).assistant,
            role: "assistant" as const,
            parts: [
              {
                type: "text" as const,
                text: t.output || "No response was saved.",
              },
            ],
          },
        ]
      : []),
  ])
}
async function getPage(
  workspaceId: string,
  operation: string,
  chatId?: string,
  before?: { created_at: string; id: string }
) {
  const query = new URLSearchParams({ workspaceId, operation })
  if (chatId) query.set("chatId", chatId)
  if (before) {
    query.set("before", before.created_at)
    query.set("beforeId", before.id)
  }
  const response = await fetch(`/api/ai/history?${query}`, {
    cache: "no-store",
  })
  if (!response.ok) throw new Error("History could not load. Please try again.")
  return response.json()
}
const starters = [
  {
    label: "Brainstorm",
    icon: Lightbulb,
    prompt:
      "Brainstorm five creative ways a small team can find its next product idea. Keep each suggestion practical and brief.",
  },
  {
    label: "SaaS ideas",
    icon: Rocket,
    prompt:
      "Suggest five focused SaaS ideas a solo founder could build. For each, name the customer, the problem, and a simple first version.",
  },
  {
    label: "Write something",
    icon: Pencil,
    prompt:
      "Draft a friendly, concise welcome email for a new customer trying a SaaS product. Use placeholders for the product name and first action.",
  },
  {
    label: "Make a plan",
    icon: ListChecks,
    prompt:
      "Give me a practical five-step plan to validate a product idea before building it. Include one concrete action for each step.",
  },
]
export function AIChat(props: Props) {
  const router = useRouter()
  const [activeChatId, setActiveChatId] = useState(props.chatId)
  const submitting = useRef(false)
  const historyRevision = useRef(0)
  const followOutput = useRef(true)
  const [input, setInput] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [credits, setCredits] = useState(props.credits)
  const [turns, setTurns] = useState(props.turns.slice(0, 20))
  const [moreTurns, setMoreTurns] = useState(props.turns.length > 20)
  const bottom = useRef<HTMLDivElement>(null)
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        prepareSendMessagesRequest: ({ messages, body }) => {
          const last = messages.at(-1)!
          return {
            body: {
              id: last.id,
              chatId: body?.chatId,
              workspaceId: props.workspaceId,
              prompt: last.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join(""),
            },
          }
        },
      })
  )
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: props.chatId,
    transport,
    messages: toMessages(props.turns.slice(0, 20)),
    generateId: () => crypto.randomUUID(),
    onError: (e) => {
      try {
        setError(JSON.parse(e.message).error)
      } catch {
        setError(
          "The response was interrupted. Reload saved messages or try again."
        )
      }
    },
  })
  const streaming = status === "submitted" || status === "streaming"
  const savedStreaming = turns.some((t) => t.status === "streaming")
  const reload = useCallback(async () => {
    const revision = ++historyRevision.current
    try {
      const balance = await getPage(props.workspaceId, "credits")
      if (revision !== historyRevision.current) return
      setCredits(balance)
      if (activeChatId) {
        const page: Turn[] = await getPage(
          props.workspaceId,
          "messages",
          activeChatId
        )
        if (revision !== historyRevision.current) return
        setTurns(page.slice(0, 20))
        setMoreTurns(page.length > 20)
        setMessages(toMessages(page.slice(0, 20)))
      }
    } catch (e) {
      if (revision === historyRevision.current) setError((e as Error).message)
    }
  }, [props.workspaceId, activeChatId, setMessages])
  const wasStreaming = useRef(false)
  useEffect(() => {
    if (streaming) wasStreaming.current = true
    else if (wasStreaming.current) {
      wasStreaming.current = false
      void reload()
    }
  }, [streaming, reload])
  useEffect(() => {
    if (!savedStreaming || streaming) return
    const timer = setInterval(() => void reload(), 3000)
    return () => clearInterval(timer)
  }, [savedStreaming, streaming, reload])
  useEffect(() => {
    if (streaming && followOutput.current)
      bottom.current?.scrollIntoView({ block: "nearest" })
  }, [messages, streaming])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" })
  }, [])
  function newChat() {
    if (streaming || submitting.current) return
    historyRevision.current++
    setActiveChatId(undefined)
    setInput("")
    setError("")
    setTurns([])
    setMoreTurns(false)
    setMessages([])
    router.push("/dashboard/chat")
  }
  async function submitPrompt(prompt: string) {
    if (
      !prompt.trim() ||
      !props.enabled ||
      credits.available < 1 ||
      streaming ||
      savedStreaming ||
      submitting.current
    )
      return
    submitting.current = true
    // A previous completion's history request must not replace a new live turn.
    historyRevision.current++
    setBusy(true)
    setError("")
    followOutput.current = true
    try {
      let id = activeChatId
      if (!id) {
        id = crypto.randomUUID()
        const response = await fetch("/api/ai/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, workspaceId: props.workspaceId }),
        })
        if (!response.ok)
          throw new Error("Chat could not be created. Try again shortly.")
        setActiveChatId(id)
        window.history.replaceState(null, "", "/dashboard/chat/" + id)
      }
      setInput("")
      await sendMessage({ text: prompt.trim() }, { body: { chatId: id } })
      // Refresh the saved route after streaming so back/forward navigation has
      // its server-loaded conversation, without remounting an active stream.
      if (!activeChatId) router.refresh()
    } catch (e) {
      setInput(prompt)
      setError((e as Error).message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  async function loadOlder() {
    setBusy(true)
    setError("")
    try {
      const page: Turn[] = await getPage(
        props.workspaceId,
        "messages",
        activeChatId,
        turns.at(-1)
      )
      const all = [...turns, ...page.slice(0, 20)]
      setTurns(all)
      setMoreTurns(page.length > 20)
      setMessages(toMessages(all))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const latest = turns[0]
  async function stopResponse() {
    const requestId = messages
      .filter((message) => message.role === "user")
      .at(-1)?.id
    void stop()
    if (requestId) {
      try {
        const response = await fetch("/api/ai/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: props.workspaceId,
            id: requestId,
            operation: "stop",
          }),
        })
        if (!response.ok) throw new Error()
      } catch {
        setError(
          "Stop could not be confirmed. Reload saved messages to check its status."
        )
      }
      await reload()
    }
  }
  return (
    <div className="flex h-full min-h-0 w-full bg-background">
      <section
        aria-label="Chat"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-8">
          <div className="flex items-center gap-2">
            <h1 className="sr-only">AI chat</h1>
            <Button
              onClick={newChat}
              disabled={busy || streaming || !props.enabled}
              size="sm"
              variant="secondary"
              className="gap-2 rounded-lg"
            >
              <Plus className="size-4" />
              New chat
            </Button>
            <ChatHistoryDialog
              workspaceId={props.workspaceId}
              workspace={props.workspace}
              activeChatId={activeChatId}
              previewChats={props.preview ? props.chats : undefined}
            />
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-muted-foreground">
              {credits.available.toLocaleString()} credits available
              {credits.reserved ? " · " + credits.reserved + " in use" : ""}
            </p>
            <p className="sr-only">Shared by {props.workspace}</p>
          </div>
        </div>
        <div
          data-chat-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-10"
          onScroll={(e) => {
            const el = e.currentTarget
            followOutput.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100
          }}
        >
          <div
            className={
              "mx-auto flex min-h-full w-full max-w-3xl flex-col " +
              (messages.length ? "py-8" : "justify-center py-10")
            }
          >
            {!messages.length && (
              <div className="mx-auto w-full max-w-xl pb-8 text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  A little space to think bigger
                </p>
                <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
                  Where should we start?
                </h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                  Explore an idea, find the right words, or figure out what’s
                  next.
                </p>
                <div
                  className="mt-8 flex flex-wrap justify-center gap-2"
                  aria-label="Suggested prompts"
                >
                  {starters.map(({ label, icon: Icon, prompt }) => (
                    <Button
                      key={label}
                      variant="ghost"
                      disabled={!props.enabled || busy || credits.available < 1}
                      onClick={() => void submitPrompt(prompt)}
                      className="h-10 gap-2 rounded-full bg-muted/60 px-4 text-xs font-normal hover:bg-muted"
                    >
                      <Icon className="size-3.5 text-muted-foreground" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {moreTurns && (
              <Button
                variant="ghost"
                size="sm"
                className="mb-6 self-center"
                onClick={() => loadOlder()}
                disabled={busy || streaming}
              >
                Load earlier messages
              </Button>
            )}
            <div
              role="log"
              aria-label="Messages"
              aria-live="polite"
              className="space-y-8 sm:space-y-10"
            >
              {messages.map((message) => {
                const text = message.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("")
                const saved = turns.find(
                  (t) => chatMessageIds(t.id).assistant === message.id
                )
                const authored = turns.find(
                  (t) => chatMessageIds(t.id).user === message.id
                )
                return (
                  <article
                    key={message.id}
                    data-message-role={message.role}
                    className={
                      message.role === "user"
                        ? "ml-auto w-fit max-w-[90%] rounded-2xl bg-muted/70 px-5 py-3"
                        : "max-w-full"
                    }
                  >
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {message.role === "user"
                        ? authored && !authored.is_mine
                          ? "Workspace member"
                          : "You"
                        : "Assistant"}
                    </p>
                    <div className="text-[15px] leading-7 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                      {text}
                    </div>
                    {message.role === "assistant" && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Copy response"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(text)
                              .catch(() =>
                                setError(
                                  "Copy was unavailable. Select and copy the response."
                                )
                              )
                          }
                        >
                          <Copy />
                        </Button>
                        {saved && (
                          <>
                            <span>
                              {saved.status === "completed"
                                ? "1 credit"
                                : saved.status === "streaming"
                                  ? "In progress"
                                  : `${saved.status} · no credit used`}
                            </span>
                            {saved.input_tokens != null && (
                              <span>
                                {saved.input_tokens} in /{" "}
                                {saved.output_tokens ?? "—"} out tokens
                              </span>
                            )}
                            {saved.cost_usd != null && (
                              <span>
                                ${Number(saved.cost_usd).toFixed(6)} provider
                                cost
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
            {(streaming || savedStreaming) && (
              <p
                role="status"
                className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Loader2 className="size-3 animate-spin" />
                Response in progress…
              </p>
            )}

            <div ref={bottom} />
          </div>
        </div>
        <div
          data-chat-composer
          className="shrink-0 bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-10 sm:pb-5"
        >
          <div className="mx-auto w-full max-w-3xl">
            {error && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {!props.enabled && (
              <p role="status" className="mb-3 text-xs text-muted-foreground">
                AI chat is not available yet. Contact your workspace
                administrator.
              </p>
            )}
            {props.enabled && credits.available === 0 && !streaming && (
              <p className="mb-3 text-sm text-muted-foreground">
                This workspace has used its one-time AI credits. Credits do not
                renew with billing.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submitPrompt(input)
              }}
              className="rounded-2xl bg-muted/55 p-3 ring-1 ring-border/40 focus-within:ring-ring/50 sm:p-4"
            >
              <label htmlFor="chat-message" className="sr-only">
                Your message
              </label>
              <Textarea
                id="chat-message"
                placeholder="Ask anything, or start with an idea…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={4000}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault()
                    void submitPrompt(input)
                  }
                }}
                disabled={
                  !props.enabled ||
                  busy ||
                  streaming ||
                  savedStreaming ||
                  credits.available < 1
                }
                className="max-h-40 min-h-14 resize-none border-0 bg-transparent px-1 py-1 text-[15px] shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="pl-1 text-[11px] text-muted-foreground">
                  1 credit per response
                </span>
                {streaming ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void stopResponse()}
                  >
                    <Square />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-xl"
                    aria-label="Send message"
                    disabled={
                      !input.trim() ||
                      !props.enabled ||
                      busy ||
                      savedStreaming ||
                      credits.available < 1
                    }
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
                  </Button>
                )}
              </div>
            </form>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Conversations are shared with your workspace.
            </p>
            {!streaming &&
              (error ||
                (latest &&
                  ["failed", "stopped", "expired"].includes(
                    latest.status
                  ))) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void reload()}
                  >
                    <RotateCcw />
                    Reload saved messages
                  </Button>
                  {latest && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInput(latest.prompt)
                        setError("")
                      }}
                    >
                      Retry message
                    </Button>
                  )}
                </div>
              )}
          </div>
        </div>
      </section>
    </div>
  )
}
