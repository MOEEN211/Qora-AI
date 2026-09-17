"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { WorkspaceLogo } from "./workspace-logo"
import { switchWorkspace, createWorkspace } from "@/app/actions/workspaces"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Feedback } from "@/components/settings/shared"
import type { ActionState } from "@/lib/form-state"

export type WorkspaceChoice = {
  id: string
  name: string
  role: string
  logoUrl?: string | null
}
export function WorkspaceSwitcher({
  workspaces,
  current,
}: {
  workspaces: WorkspaceChoice[]
  current: string
}) {
  const router = useRouter()
  const [request, setRequest] = useState<string | null>(null)
  const [state, setState] = useState<ActionState>({})
  const [pending, start] = useTransition()
  const workspace = workspaces.find((item) => item.id === current)!
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-sidebar-row="workspace"
          disabled={pending}
          aria-label="Switch workspace"
          title={workspace.name}
          className="my-7 flex w-full min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <WorkspaceLogo name={workspace.name} url={workspace.logoUrl} />
          <span data-sidebar-label className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {workspace.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground capitalize">
              {workspace.role}
            </span>
          </span>
          <ChevronsUpDown
            data-sidebar-label
            className="size-4 shrink-0 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-w-[calc(100vw-2rem)] min-w-56">
          {workspaces.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() =>
                start(async () => {
                  try {
                    const result = await switchWorkspace(item.id)
                    setState(result)
                    if (!result.error) router.refresh()
                  } catch {
                    setState({
                      error: "Could not switch workspace. Try again.",
                    })
                  }
                })
              }
            >
              <WorkspaceLogo name={item.name} url={item.logoUrl} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.id === current && <Check aria-label="Current workspace" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setState({})
              setRequest(crypto.randomUUID())
            }}
          >
            <Plus />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!request && state.error && <Feedback state={state} />}
      <Dialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setRequest(null)
            setState({})
          }
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              A separate space for your projects and team. You will be its
              owner.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              start(async () => {
                form.set("request_id", request!)
                try {
                  const result = await createWorkspace({}, form)
                  setState(result)
                  if (result.success) {
                    setRequest(null)
                    router.push("/dashboard")
                    router.refresh()
                  }
                } catch {
                  setState({
                    error:
                      "Could not confirm creation. Retry this form to safely resume.",
                  })
                }
              })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                name="name"
                minLength={2}
                maxLength={80}
                required
                autoComplete="off"
              />
            </div>
            <Feedback state={state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
