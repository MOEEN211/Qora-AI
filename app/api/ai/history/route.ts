import { z } from "zod"
import { aiHistory, aiSearch, smallJson } from "@/lib/ai/server"
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const target = query.get("workspaceId")
  if (!z.uuid().safeParse(target).success)
    return Response.json({ error: "Invalid workspace" }, { status: 400 })
  try {
    const operation = query.get("operation") || "chats"
    if (operation === "search") {
      const search = z
        .string()
        .max(120)
        .parse(query.get("q") || "")
      const before = z.iso
        .datetime({ offset: true })
        .nullable()
        .parse(query.get("before"))
      const beforeId = z.uuid().nullable().parse(query.get("beforeId"))
      return Response.json(await aiSearch(target!, search, before, beforeId), {
        headers: { "Cache-Control": "no-store" },
      })
    }
    if (!["chats", "messages", "credits"].includes(operation)) throw new Error()
    const data = await aiHistory(target!, operation, {
      chat_id: query.get("chatId"),
      before: query.get("before"),
      before_id: query.get("beforeId"),
    })
    return Response.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "History is unavailable." }, { status: 403 })
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(process.env.APP_URL!).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 })
  try {
    const body = z
      .object({
        workspaceId: z.uuid(),
        id: z.uuid(),
        operation: z.enum(["create", "stop"]).default("create"),
      })
      .parse(await smallJson(request))
    const data = await aiHistory(body.workspaceId, body.operation, {
      id: body.id,
    })
    return Response.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json(
      { error: "Chat could not be created. Try again shortly." },
      { status: 400 }
    )
  }
}
