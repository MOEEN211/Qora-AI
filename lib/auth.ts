import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { supabaseConfigured } from "@/lib/supabase/config"

export const optionalUser = cache(async () => {
  if (!supabaseConfigured()) return null
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return { user, supabase }
})

export const requireUser = cache(async () => {
  const session = await optionalUser()
  if (!session) redirect("/login")
  const { user } = session
  if (!user.email_confirmed_at) redirect("/verify-email")
  return session
})

export async function redirectSignedInUser() {
  if (await optionalUser()) redirect("/dashboard")
}

export const publicAccount = cache(async () => {
  const session = await optionalUser()
  if (!session) return null
  const { user, supabase } = session
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_path")
    .eq("id", user.id)
    .maybeSingle()
  const avatar = profile?.avatar_path
    ? await supabase.storage
        .from("avatars")
        .createSignedUrl(profile.avatar_path, 3600)
    : null
  return {
    name: profile?.full_name || "Your account",
    email: user.email || "",
    avatarUrl: avatar?.data?.signedUrl || null,
  }
})

export const getWorkspace = cache(async (target?: string) => {
  const { user, supabase } = await requireUser()
  const [profile, membership, logos] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, created_at, avatar_path")
      .eq("id", user.id)
      .single(),
    supabase
      .from("organization_members")
      .select("org_id, role, organizations(id, name, slug, created_at)")
      .eq("user_id", user.id)
      .order("created_at")
      .order("org_id"),
    supabase.from("workspace_logos").select("org_id, version"),
  ])
  if (profile.error || membership.error || !membership.data?.length)
    throw new Error(
      "Workspace unavailable. Check that kickstart completed successfully."
    )
  // Supabase relationship shape is narrowed at this boundary until generated types are available.
  const workspaces = membership.data.map((row) => {
    const raw = row.organizations
    const organization = (Array.isArray(raw) ? raw[0] : raw) as {
      id: string
      name: string
      slug: string
      created_at: string
    }
    const logo = logos.data?.find((item) => item.org_id === organization.id)
    return {
      ...organization,
      role: row.role as "owner" | "admin" | "member",
      logoUrl: logo
        ? `/api/workspaces/${organization.id}/logo?v=${logo.version}`
        : null,
    }
  })
  const selected = target || (await cookies()).get("forma-workspace")?.value
  const match = workspaces.find((item) => item.id === selected)
  if (target && !match)
    throw new Error("Workspace access is no longer available.")
  const organization = match || workspaces[0]
  const count = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", organization.id)
  if (count.error) throw new Error("Workspace members could not be loaded.")
  const avatar = profile.data.avatar_path
    ? await supabase.storage
        .from("avatars")
        .createSignedUrl(profile.data.avatar_path, 3600)
    : null
  return {
    user,
    profile: profile.data,
    organization,
    role: organization.role,
    workspaces,
    memberCount: count.count ?? 0,
    avatarUrl: avatar?.data?.signedUrl ?? null,
  }
})
