import "server-only"
import { cookies } from "next/headers"

export async function selectWorkspace(id: string) {
  ;(await cookies()).set("forma-workspace", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://"),
    path: "/",
    maxAge: 31536000,
  })
}

export async function invitationContext() {
  const token = (await cookies()).get("forma-invitation")?.value
  return token && /^[0-9a-f]{64}$/.test(token) ? token : undefined
}

export async function clearInvitationContext() {
  ;(await cookies()).delete("forma-invitation")
}
