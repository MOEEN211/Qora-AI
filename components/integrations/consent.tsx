"use client"
import { useActionState } from "react"
import { decideConnection } from "@/app/actions/integrations"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Feedback } from "@/components/settings/shared"
export function ConsentForm({
  authorizationId,
  workspaces,
}: {
  authorizationId: string
  workspaces: { id: string; name: string }[]
}) {
  const [state, action, pending] = useActionState(decideConnection, {})
  return (
    <form action={action} className="mt-8 space-y-6">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <div className="space-y-2">
        <Label htmlFor="workspace">Workspace</Label>
        <select
          id="workspace"
          name="workspace"
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
          required
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium">
          Allow this application to
        </legend>
        <label className="flex gap-3 rounded-lg border p-4 text-sm">
          <input type="radio" name="permission" value="read" defaultChecked />
          <span>Read workspace details and list its ID</span>
        </label>
        <label className="flex gap-3 rounded-lg border p-4 text-sm">
          <input type="radio" name="permission" value="read_write" />
          <span>Read workspace details and rename it</span>
        </label>
      </fieldset>
      <Feedback state={state} />
      <div className="flex gap-3">
        <Button
          type="submit"
          name="decision"
          value="deny"
          variant="outline"
          disabled={pending}
          formNoValidate
        >
          Decline
        </Button>
        <Button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending || !workspaces.length}
        >
          Allow access
        </Button>
      </div>
    </form>
  )
}
