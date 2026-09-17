import { notFound } from "next/navigation"
import { z } from "zod"
import { getWorkspace } from "@/lib/auth"
import { aiHistory } from "@/lib/ai/server"
import { aiConfig } from "@/lib/ai/config.mjs"
import { AIChat } from "@/components/ai/chat"
export const metadata = { title: "AI chat" }
export default async function ChatPage({
  params,
}: {
  params: Promise<{ chat?: string[] }>
}) {
  const { chat } = await params
  if (chat && (chat.length !== 1 || !z.uuid().safeParse(chat[0]).success))
    notFound()
  const { organization } = await getWorkspace()
  const chatId = chat?.[0]
  const config = aiConfig(process.env)
  if (!config.enabled)
    return (
      <AIChat
        workspaceId={organization.id}
        workspace={organization.name}
        chats={[]}
        turns={[]}
        credits={{
          available: 0,
          allowance: 0,
          consumed: 0,
          reserved: 0,
        }}
        enabled={false}
      />
    )
  const [chats, credits, turns] = await Promise.all([
    aiHistory(organization.id, "chats"),
    aiHistory(organization.id, "credits", {}),
    chatId
      ? aiHistory(organization.id, "messages", { chat_id: chatId }).catch(() =>
          notFound()
        )
      : Promise.resolve([]),
  ])
  return (
    <AIChat
      key={`${organization.id}-${chatId || "new"}`}
      workspaceId={organization.id}
      workspace={organization.name}
      chatId={chatId}
      chats={chats}
      turns={turns}
      credits={credits}
      enabled={config.enabled && !!config.key}
    />
  )
}
