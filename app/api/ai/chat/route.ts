import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  consumeStream,
  streamText,
  type ModelMessage,
} from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { z } from "zod"
import { requireUser, getWorkspace } from "@/lib/auth"
import { aiRun, smallJson } from "@/lib/ai/server"
import {
  aiConfig,
  boundedContext,
  chatMessageIds,
  SYSTEM_PROMPT,
} from "@/lib/ai/config.mjs"

export const maxDuration = 120
const schema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  workspaceId: z.uuid(),
  prompt: z.string().trim().min(1).max(4000),
})
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(process.env.APP_URL!).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 })
  const { user } = await requireUser()
  const config = aiConfig(process.env)
  if (!config.enabled || !config.key)
    return Response.json(
      { error: "AI chat is not configured yet." },
      { status: 503 }
    )
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await smallJson(request))
    await getWorkspace(body.workspaceId)
  } catch {
    return Response.json(
      { error: "Invalid message or workspace." },
      { status: 400 }
    )
  }
  let reservation
  try {
    reservation = await aiRun("reserve", {
      id: body.id,
      chat_id: body.chatId,
      org_id: body.workspaceId,
      user_id: user.id,
      prompt: body.prompt,
      model: config.model,
    })
    if (reservation.duplicate)
      return Response.json(
        {
          error:
            "This message was already submitted. Reload the chat to see its saved status.",
        },
        { status: 409 }
      )
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 429 })
  }
  const identity = { id: body.id, lease: reservation.lease }
  const stream = createUIMessageStream({
    async execute({ writer }) {
      let output = "",
        providerId: string | undefined,
        lastSave = 0
      let inputTokens: number | undefined,
        outputTokens: number | undefined,
        cost: number | undefined
      let finished = false
      const controller = new AbortController()
      const timeout = AbortSignal.timeout(90000)
      const signal = AbortSignal.any([
        request.signal,
        timeout,
        controller.signal,
      ])
      writer.write({
        type: "start",
        messageId: chatMessageIds(body.id).assistant,
      })
      writer.write({ type: "text-start", id: body.id })
      try {
        const result = streamText({
          model: createOpenRouter({ apiKey: config.key })(config.model, {
            usage: { include: true },
          }),
          instructions: SYSTEM_PROMPT,
          messages: boundedContext(
            reservation.context,
            body.prompt
          ) as ModelMessage[],
          maxOutputTokens: 1024,
          maxRetries: 0,
          // Provider errors are handled below; never log raw provider request details.
          onError: () => {},
          abortSignal: signal,
        })
        for await (const part of result.stream) {
          if (part.type === "error") throw new Error("Provider error")
          if (part.type === "abort") throw new Error("Generation stopped")
          if (part.type === "text-delta") {
            output += part.text
            if (output.length > 40000) throw new Error("Output limit exceeded")
            writer.write({ type: "text-delta", id: body.id, delta: part.text })
            if (Date.now() - lastSave > 1000) {
              const state = await aiRun("checkpoint", {
                ...identity,
                output,
                provider_id: providerId,
              })
              if (state.status !== "streaming")
                throw new Error("Reservation expired")
              lastSave = Date.now()
            }
          }
          if (part.type === "finish-step") {
            providerId = part.response.id
            inputTokens = part.usage.inputTokens
            outputTokens = part.usage.outputTokens
            const usage = part.providerMetadata?.openrouter?.usage as
              { cost?: number } | undefined
            cost = usage?.cost
          }
          if (part.type === "finish")
            finished = ["stop", "length"].includes(part.finishReason)
        }
        if (signal.aborted || !finished || !output.trim())
          throw new Error("Response incomplete")
        const saved = await aiRun("settle", {
          ...identity,
          status: "completed",
          output,
          provider_id: providerId,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: cost,
        })
        if (saved.status !== "completed")
          throw new Error("Response could not be finalized")
        writer.write({ type: "text-end", id: body.id })
        writer.write({ type: "finish", finishReason: "stop" })
      } catch {
        controller.abort()
        // Retrying settlement cannot double-charge. Cron handles database outages.
        try {
          await aiRun("settle", {
            ...identity,
            status: request.signal.aborted ? "stopped" : "failed",
            output: output.slice(0, 40000),
            provider_id: providerId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: cost,
          })
        } catch {
          /* Recovery releases the reservation after its deadline. */
        }
        writer.write({ type: "text-end", id: body.id })
        writer.write({
          type: "error",
          errorText:
            "Response interrupted. Reload to see its saved status; incomplete responses use no credits.",
        })
      }
    },
    onError: () => "Chat is temporarily unavailable.",
  })
  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store" },
    consumeSseStream: ({ stream }) => consumeStream({ stream }),
  })
}
