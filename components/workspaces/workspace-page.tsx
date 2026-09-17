"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateWorkspace } from "@/app/actions/settings"
import {
  inviteMember,
  revokeInvitation,
  changeMember,
  deleteWorkspace,
  transferOwnership,
} from "@/app/actions/workspaces"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { TeamTable, type Member, type Invitation } from "./team-table"
import { Feedback, PasswordField, Section } from "@/components/settings/shared"
import type { ActionState } from "@/lib/form-state"
import { LogoSettings } from "./logo-settings"

type Action = (_: ActionState, form: FormData) => Promise<ActionState>
type Prompt = {
  title: string
  description: string
  action: Action
  fields?: Record<string, string>
  kind?: "invite" | "delete"
}
export function WorkspacePage({
  workspace,
  role,
  userId,
  team,
  now,
}: {
  workspace: { id: string; name: string; slug: string; logoUrl?: string | null }
  role: string
  userId: string
  team: { members: Member[]; invitations: Invitation[] }
  now: number
}) {
  const router = useRouter()
  const [state, setState] = useState<ActionState>({}),
    [dialogState, setDialogState] = useState<ActionState>({})
  const [pending, start] = useTransition(),
    [prompt, setPrompt] = useState<Prompt | null>(null)
  const manage = role === "owner" || role === "admin"
  function open(value: Prompt) {
    setDialogState({})
    setPrompt(value)
  }
  function submit(action: Action, form: FormData, dialog = false) {
    start(async () => {
      form.set("org_id", workspace.id)
      try {
        const result = await action({}, form)
        ;(dialog ? setDialogState : setState)(result)
        if (result.success) {
          setPrompt(null)
          setState(result)
          if (action === deleteWorkspace) router.push("/dashboard")
          router.refresh()
        } else if (action === inviteMember) router.refresh()
      } catch {
        ;(dialog ? setDialogState : setState)({
          error: "The change could not be completed. Refresh and try again.",
        })
      }
    })
  }
  function memberPrompt(member: Member, value: string) {
    open({
      title:
        value === "remove"
          ? member.id === userId
            ? "Leave workspace"
            : "Remove member"
          : "Change role",
      action: changeMember,
      fields: { person: member.id, role: value },
      description:
        value === "remove"
          ? `Remove ${member.name || member.email}'s access to ${workspace.name}. Their workspace API keys will be revoked. If no workspace remains, a personal one will be created.`
          : `Make ${member.name || member.email} ${value === "admin" ? "an Admin" : "a Member"} in ${workspace.name}.${value === "member" ? " Their workspace API keys and outstanding invitations will be revoked." : ""}`,
    })
  }
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Workspace</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Manage {workspace.name} and the people you share it with.
        </p>
      </div>
      <Tabs
        defaultValue="general"
        className="gap-8"
        onValueChange={() => setState({})}
      >
        <TabsList aria-label="Workspace sections" className="max-w-full">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        <Feedback state={state} />
        <TabsContent value="general" className="space-y-6">
          <LogoSettings workspace={workspace} canManage={manage} />
          <Card className="gap-0 py-0">
            <Section
              title="Workspace details"
              description="Make this space recognizable to everyone on your team."
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  submit(updateWorkspace, new FormData(event.currentTarget))
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Workspace name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={workspace.name}
                    readOnly={!manage}
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Workspace identifier</Label>
                  <Input
                    id="slug"
                    value={workspace.slug}
                    readOnly
                    className="bg-muted font-mono text-sm text-muted-foreground dark:bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    A permanent identifier for this workspace.
                  </p>
                </div>
                {manage ? (
                  <Button disabled={pending} type="submit">
                    Save workspace
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Only an owner or admin can change workspace details.
                  </p>
                )}
              </form>
            </Section>
          </Card>
        </TabsContent>
        <TabsContent value="advanced" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Danger zone</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your access or permanently delete this workspace.
            </p>
          </div>
          <Card className="gap-0 py-0">
            <Section
              title="Leave workspace"
              description="Remove your access to this workspace."
            >
              <p className="mb-5 text-sm leading-6 text-muted-foreground">
                {role === "owner"
                  ? team.members.length === 1
                    ? "You are the only member. Leaving requires deleting this workspace and revoking its pending invitations. Your account stays available; a personal workspace is created if needed."
                    : "Transfer ownership to an active teammate in Team before leaving. You will become an Admin and can then leave."
                  : "Your account and other workspaces stay available. If this is your last workspace, we will create a personal one for you."}
              </p>
              <Button
                variant="outline"
                disabled={
                  pending || (role === "owner" && team.members.length > 1)
                }
                onClick={() => {
                  if (role === "owner")
                    open({
                      kind: "delete",
                      title: "Delete workspace to leave",
                      description: `Leaving as the only member deletes ${workspace.name}, its data, and any pending invitations. Your account will remain. Confirm with your password and the workspace name.`,
                      action: deleteWorkspace,
                    })
                  else
                    memberPrompt(
                      team.members.find((m) => m.id === userId)!,
                      "remove"
                    )
                }}
              >
                Leave workspace
              </Button>
            </Section>
          </Card>
          {role === "owner" && (
            <Card className="gap-0 py-0">
              <Section
                title="Delete workspace"
                description="Permanently delete this workspace and its data for everyone."
              >
                <p className="mb-5 text-sm leading-6 text-muted-foreground">
                  Member accounts and their other workspaces are kept. Anyone
                  without another workspace receives a personal one.
                </p>
                <Button
                  variant="destructive"
                  onClick={() =>
                    open({
                      kind: "delete",
                      title: "Delete workspace",
                      description: `Permanently delete ${workspace.name} and all its data for every member. Accounts and other workspaces will remain.`,
                      action: deleteWorkspace,
                    })
                  }
                >
                  Delete workspace
                </Button>
              </Section>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="team" className="min-w-0 space-y-6">
          <TeamTable
            members={team.members}
            invitations={team.invitations}
            userId={userId}
            role={role}
            now={now}
            pending={pending}
            onInvite={() =>
              open({
                kind: "invite",
                title: `Invite to ${workspace.name}`,
                description:
                  "Choose their role. Access starts after they accept and verify their email.",
                action: inviteMember,
              })
            }
            onMember={memberPrompt}
            onTransfer={(member) =>
              open({
                title: "Transfer ownership",
                description: `Make ${member.name || member.email} the sole Owner of ${workspace.name}. You will become an Admin. Only the new Owner will be able to transfer ownership or delete this workspace.`,
                action: transferOwnership,
                fields: { person: member.id },
              })
            }
            onResend={(invitation: Invitation) => {
              const form = new FormData()
              form.set("invitation_id", invitation.id)
              form.set("email", invitation.email)
              form.set("role", invitation.role)
              submit(inviteMember, form)
            }}
            onRevoke={(invitation: Invitation) =>
              open({
                title: "Revoke invitation",
                description: `Revoke ${invitation.email}'s invitation to ${workspace.name}. Their link will stop working.`,
                action: revokeInvitation,
                fields: { invitation_id: invitation.id },
              })
            }
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={prompt !== null}
        onOpenChange={(value) => {
          if (!value && !pending) setPrompt(null)
        }}
      >
        <DialogContent showCloseButton={!pending}>
          {prompt && (
            <>
              <DialogHeader>
                <DialogTitle>{prompt.title}</DialogTitle>
                <DialogDescription>{prompt.description}</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  Object.entries(prompt.fields || {}).forEach(([key, value]) =>
                    form.set(key, value)
                  )
                  submit(prompt.action, form, true)
                }}
              >
                {prompt.kind === "invite" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        id="invite-email"
                        name="email"
                        type="email"
                        maxLength={254}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <NativeSelect
                        id="invite-role"
                        name="role"
                        defaultValue="member"
                        className="w-full"
                        disabled={pending}
                        aria-describedby="invite-role-help"
                      >
                        <NativeSelectOption value="member">
                          Member
                        </NativeSelectOption>
                        <NativeSelectOption value="admin">
                          Admin
                        </NativeSelectOption>
                      </NativeSelect>
                      <p
                        id="invite-role-help"
                        className="text-xs text-muted-foreground"
                      >
                        Admins can manage members and invite Admins or Members.
                        Only the Owner can transfer ownership after someone
                        joins.
                      </p>
                    </div>
                  </>
                )}
                {prompt.kind === "delete" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="confirmation">
                        Type {workspace.name} to confirm
                      </Label>
                      <Input
                        id="confirmation"
                        name="confirmation"
                        required
                        autoComplete="off"
                      />
                    </div>
                    <PasswordField
                      name="password"
                      label="Current password"
                      current
                    />
                  </>
                )}
                <Feedback state={dialogState} />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    type="button"
                    disabled={pending}
                    onClick={() => setPrompt(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={pending}
                    variant={
                      prompt.kind === "delete" ||
                      prompt.fields?.role === "remove"
                        ? "destructive"
                        : "default"
                    }
                  >
                    {pending
                      ? "Saving…"
                      : prompt.kind === "invite"
                        ? "Send invitation"
                        : "Confirm"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
