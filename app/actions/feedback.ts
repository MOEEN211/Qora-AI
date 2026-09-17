"use server"

import { z } from "zod"
import { getWorkspace, requireUser } from "@/lib/auth"
import type { ActionState } from "@/lib/form-state"

const submission = z.object({
  kind: z.enum(["bug", "feature"]),
  id: z.uuid(),
  workspaceId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
})

export async function submitFeedback(input: unknown): Promise<ActionState> {
  const { supabase } = await requireUser()
  const parsed = submission.safeParse(input)
  if (!parsed.success)
    return {
      error:
        "Use a title of 3–120 characters and details of 10–5,000 characters.",
    }
  const { kind, id, title, description } = parsed.data
  try {
    const { organization } = await getWorkspace(parsed.data.workspaceId)
    const { error } = await supabase.rpc("submit_feedback", {
      kind,
      submission_id: id,
      target: organization.id,
      subject: title,
      details: description,
    })
    if (error)
      return {
        error:
          error.message === "Feedback limit reached"
            ? "You've reached the limit of 10 submissions per hour. Please try again later."
            : "We couldn't save your feedback. Please retry; the same submission won't be duplicated.",
      }
    return {
      success:
        kind === "bug"
          ? "Bug report submitted. Thank you for helping us improve."
          : "Feature request submitted. It's now on the board.",
    }
  } catch {
    return {
      error: "We couldn't reach the feedback service. Please try again.",
    }
  }
}

export async function setFeatureVote(
  id: string,
  upvoted: boolean
): Promise<ActionState & { votes?: number; voted?: boolean }> {
  const { supabase } = await requireUser()
  if (!z.uuid().safeParse(id).success || typeof upvoted !== "boolean")
    return { error: "Invalid vote." }
  try {
    const { data, error } = await supabase.rpc("set_feature_vote", {
      feature_id: id,
      upvoted,
    })
    if (error)
      return {
        error: "Your vote couldn't be saved. Refresh the board and try again.",
      }
    return {
      success: upvoted ? "Vote added." : "Vote removed.",
      votes: data.votes,
      voted: data.voted,
    }
  } catch {
    return {
      error: "We couldn't reach the feedback service. Please try again.",
    }
  }
}
