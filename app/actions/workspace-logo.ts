"use server"
import sharp from "sharp"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import type { ActionState } from "@/lib/form-state"

export async function saveWorkspaceLogo(form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  const target = String(form.get("org_id") || "")
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      target
    )
  )
    return { error: "Choose a workspace first." }
  const membership = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", target)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!membership.data || !["owner", "admin"].includes(membership.data.role))
    return { error: "Only workspace Owners and Admins can change the logo." }
  const removing = form.get("remove") === "true"
  try {
    let image: string | null = null
    if (!removing) {
      const file = form.get("logo")
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > 2 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        return { error: "Choose a JPG, PNG, or WebP image up to 2 MB." }
      const processor = sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 25_000_000,
      })
      const metadata = await processor.metadata()
      if (
        !metadata.format ||
        !["jpeg", "png", "webp"].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1
      )
        return { error: "Choose a still JPG, PNG, or WebP image." }
      const bytes = await processor
        .rotate()
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer()
      if (bytes.length > 131072)
        return { error: "This image is too detailed. Try a simpler logo." }
      image = `\\x${bytes.toString("hex")}`
    }
    const { error } = await supabase.rpc("set_workspace_logo", {
      target,
      image,
    })
    if (error)
      return {
        error:
          "The logo couldn't be saved. Check your workspace access and try again.",
      }
    revalidatePath("/dashboard", "layout")
    return {
      success: removing ? "Workspace logo removed." : "Workspace logo updated.",
    }
  } catch {
    return {
      error:
        "We couldn't process that image. Try another JPG, PNG, or WebP file.",
    }
  }
}
