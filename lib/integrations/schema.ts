import { z } from "zod"
// Provider request identifiers are opaque URL-safe strings, not database UUIDs.
export const authorizationId = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
export const workspaceName = z.string().trim().min(2).max(80)
export const renameInput = z.strictObject({ name: workspaceName })
export const emptyInput = z.strictObject({})
export const workspaceOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  created_at: z.string(),
})
export const renameOutput = workspaceOutput.omit({ created_at: true })
export const operations = {
  get_workspace: {
    title: "Get workspace",
    description:
      "Read the connected workspace's ID, name, slug and creation date.",
    input: emptyInput,
    output: workspaceOutput,
    permission: "read",
  },
  rename_workspace: {
    title: "Rename workspace",
    description:
      "Change the connected workspace's display name. Does not change its ID, slug, members or billing.",
    input: renameInput,
    output: renameOutput,
    permission: "write",
  },
} as const
export type Operation = keyof typeof operations
