import { notFound } from "next/navigation"
import { AppShell } from "@/components/dashboard/app-shell"
import Loading from "@/app/dashboard/loading"
import { AIChat } from "@/components/ai/chat"
export default async function ChatPreview({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string; loading?: string }>
}) {
  const params = await searchParams
  const empty = params.empty === "1"
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <AppShell
      name="Alex"
      email="alex@example.com"
      workspace="Acme"
      preview
      aiEnabled
    >
      {params.loading === "1" ? (
        <Loading />
      ) : (
        <AIChat
          preview
          workspaceId="00000000-0000-4000-8000-000000000001"
          workspace="Acme"
          chatId={empty ? undefined : "00000000-0000-4000-8000-000000000002"}
          enabled={false}
          credits={{
            available: 98,
            allowance: 100,
            consumed: 2,
            reserved: 0,
          }}
          chats={[
            {
              id: "00000000-0000-4000-8000-000000000002",
              title: "A welcome message for our customers",
              created_at: "2026-09-14T00:00:00Z",
            },
          ]}
          turns={
            empty
              ? []
              : [
                  {
                    id: "00000000-0000-4000-8000-000000000003",
                    prompt:
                      "Help me write a short welcome message for our new customers.",
                    output:
                      "Welcome to Acme. We’re glad you’re here.\n\nYour workspace is ready. Start with one small project, invite a teammate, and make it your own. If you need a hand, we’re here to help.",
                    status: "completed",
                    input_tokens: 24,
                    output_tokens: 49,
                    cost_usd: 0.000088,
                    credits_charged: 1,
                    created_at: "2026-09-14T00:01:00Z",
                  },
                ]
          }
        />
      )}
    </AppShell>
  )
}
