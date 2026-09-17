"use client"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveWorkspaceLogo } from "@/app/actions/workspace-logo"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Feedback, Section } from "@/components/settings/shared"
import { WorkspaceLogo } from "./workspace-logo"
import type { ActionState } from "@/lib/form-state"

export function LogoSettings({
  workspace,
  canManage,
}: {
  workspace: { id: string; name: string; logoUrl?: string | null }
  canManage: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ActionState>({})
  const [pending, start] = useTransition()
  const router = useRouter()
  function save(file?: File) {
    const form = new FormData()
    form.set("org_id", workspace.id)
    if (file) form.set("logo", file)
    else form.set("remove", "true")
    start(async () => {
      setState({})
      try {
        const result = await saveWorkspaceLogo(form)
        setState(result)
        if (result.success) router.refresh()
      } catch {
        setState({ error: "The logo couldn't be saved. Please try again." })
      }
      if (fileInput.current) fileInput.current.value = ""
    })
  }
  return (
    <Card className="gap-0 py-0">
      <Section
        title="Workspace logo"
        description="A square logo to help your team recognize this workspace."
      >
        <div className="flex flex-wrap items-center gap-5">
          <WorkspaceLogo name={workspace.name} url={workspace.logoUrl} large />
          <div className="space-y-3">
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  aria-label="Workspace logo file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={pending}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) save(file)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => fileInput.current?.click()}
                >
                  {pending
                    ? "Saving…"
                    : workspace.logoUrl
                      ? "Change logo"
                      : "Upload logo"}
                </Button>
                {workspace.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => save()}
                  >
                    Remove logo
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only Owners and Admins can change the workspace logo.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              JPG, PNG, or WebP up to 2 MB. Images are cropped to a square.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <Feedback state={state} />
        </div>
      </Section>
    </Card>
  )
}
