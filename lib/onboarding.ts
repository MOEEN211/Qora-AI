import { z } from "zod"

export const useCases = [
  { value: "personal", label: "Personal projects" },
  { value: "work", label: "Work" },
  { value: "exploring", label: "Just exploring" },
] as const
export const onboardingInterests = [
  { value: "dashboard", label: "Explore the dashboard" },
  { value: "ai", label: "Try AI chat" },
  { value: "team", label: "Invite teammates" },
  { value: "integrations", label: "Connect an integration" },
] as const

export const onboardingSchema = z
  .object({
    display_name: z.string().trim().max(80),
    use_case: z.enum(["personal", "work", "exploring"]).nullable(),
    interests: z
      .array(z.enum(["dashboard", "ai", "team", "integrations"]))
      .max(4)
      .transform((values) => [...new Set(values)]),
    current_step: z.number().int().min(1).max(3),
    status: z.enum(["in_progress", "completed", "skipped"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "skipped") return
    if (
      (value.current_step > 1 || value.status === "completed") &&
      !value.display_name
    )
      context.addIssue({
        code: "custom",
        message: "Enter the name we should use.",
        path: ["display_name"],
      })
    if (
      (value.current_step === 3 || value.status === "completed") &&
      !value.use_case
    )
      context.addIssue({
        code: "custom",
        message: "Choose what you’ll use the product for.",
        path: ["use_case"],
      })
    if (value.status === "completed" && value.current_step !== 3)
      context.addIssue({
        code: "custom",
        message: "Finish the final step first.",
        path: ["current_step"],
      })
  })
export type OnboardingAnswers = z.infer<typeof onboardingSchema>

// Only explicit internal admin and OAuth consent continuations are accepted.
export function onboardingDestination(next?: string): string {
  if (!next) return "/dashboard"
  if (next === "/admin") return next
  return /^\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]{16,128}$/.test(next)
    ? next
    : "/dashboard"
}
