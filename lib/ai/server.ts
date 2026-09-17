import "server-only"
import { requireUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export async function aiSearch(
  target: string,
  search: string,
  before: string | null,
  beforeId: string | null
) {
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc("ai_search_chats", {
    target,
    search_text: search,
    before_at: before,
    before_id: beforeId,
  })
  if (error) throw new Error("History could not load. Please try again.")
  return data
}

export async function aiHistory(
  target: string,
  operation: string,
  payload: Record<string, unknown> = {}
) {
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc("ai_history", {
    target,
    operation,
    payload,
  })
  if (error) throw new Error("Chat is unavailable. Refresh and try again.")
  return data
}
const safeErrors = [
  "No AI credits available for this workspace",
  "This chat already has a response in progress",
  "Workspace concurrency limit reached",
  "Please wait a minute before trying again",
]
export async function aiRun(
  operation: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await createAdminClient().rpc("ai_run", {
    operation,
    payload,
  })
  if (error)
    throw new Error(
      safeErrors.includes(error.message)
        ? error.message
        : "Chat is temporarily unavailable. Please try again."
    )
  return data
}
export async function smallJson(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing message")
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 24000) {
      await reader.cancel()
      throw new Error("Message is too large")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
