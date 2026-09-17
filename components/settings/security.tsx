"use client"
import Link from "next/link"
import { useActionState, useRef, useState } from "react"
import { LoaderCircle, LockKeyhole, Trash2 } from "lucide-react"
import { changeAccountPassword, deleteAccount } from "@/app/actions/account"
import type { ActionState } from "@/lib/form-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Feedback, PasswordField, Section, type Deletion } from "./shared"

function DeleteDialog({
  deletion,
  onClose,
}: {
  deletion: Deletion
  onClose: () => void
}) {
  const [confirmation, setConfirmation] = useState("")
  const [state, action, pending] = useActionState(deleteAccount, {})
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your profile, photo, memberships, and API
            keys you created. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deletion.personal_workspaces.length > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">
              These personal workspaces will also be deleted:
            </p>
            <ul className="mt-2 list-inside list-disc text-muted-foreground">
              {deletion.personal_workspaces.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Their data and API keys will be permanently removed.
            </p>
          </div>
        )}
        <form action={action} className="space-y-5">
          <PasswordField name="password" label="Current password" current />
          <Field>
            <FieldLabel htmlFor="confirmation">
              Type DELETE to confirm
            </FieldLabel>
            <Input
              id="confirmation"
              name="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              required
            />
          </Field>
          <Feedback state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep my account
            </AlertDialogCancel>
            <Button
              variant="destructive"
              type="submit"
              disabled={pending || confirmation !== "DELETE"}
            >
              {pending && <LoaderCircle className="animate-spin" />}Delete my
              account
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
export function Security({ deletion }: { deletion: Deletion }) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      try {
        const result = await changeAccountPassword(previous, form)
        if (result.success) {
          formRef.current?.reset()
          setExpanded(false)
        }
        return result
      } catch {
        return { error: "Password couldn't be updated. Try again." }
      }
    },
    {}
  )
  return (
    <div className="space-y-8">
      <Card className="gap-0 py-0">
        <Section
          title="Password"
          description="A strong, unique password keeps your account yours."
        >
          <p className="mb-4 text-sm text-muted-foreground">
            Signed up with Google or a magic link?{" "}
            <Link
              href="/forgot-password"
              className="underline underline-offset-4"
            >
              Set a password by email
            </Link>{" "}
            before using actions that require your current password.
          </p>
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            {!expanded && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2.5">
                    <LockKeyhole className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium">Account password</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use at least 12 characters.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setExpanded(true)}>
                  Change password
                </Button>
              </div>
            )}
            <CollapsibleContent>
              <form
                ref={formRef}
                action={action}
                className="max-w-lg space-y-5"
              >
                <PasswordField
                  name="current_password"
                  label="Current password"
                  current
                />
                <PasswordField name="new_password" label="New password" />
                <PasswordField
                  name="confirm_password"
                  label="Confirm new password"
                />
                <p className="text-xs text-muted-foreground">
                  Use 12–128 characters. Avoid reusing a password from another
                  account.
                </p>
                <Feedback state={state.error ? state : {}} />
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending && <LoaderCircle className="animate-spin" />}Update
                    password
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      formRef.current?.reset()
                      setExpanded(false)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CollapsibleContent>
          </Collapsible>
          {!expanded && state.success && (
            <div className="mt-5">
              <Feedback state={state} />
            </div>
          )}
        </Section>
      </Card>
      <Card className="gap-0 py-0 ring-destructive/20">
        <Section
          title="Delete account"
          description="Permanently remove your account and its personal data."
        >
          <p className="mb-5 text-sm leading-6 text-muted-foreground">
            Shared workspaces stay with their remaining members. Personal
            workspaces and their data are deleted with your account.
          </p>
          {deletion.blocked_workspaces.length > 0 && (
            <div className="mb-5">
              <Feedback
                state={{
                  error: `Transfer ownership before deleting your account: ${deletion.blocked_workspaces.join(", ")}.`,
                }}
              />
            </div>
          )}
          <Button
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
            disabled={deletion.blocked_workspaces.length > 0}
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
            Delete account
          </Button>
        </Section>
      </Card>
      {deleting && (
        <DeleteDialog deletion={deletion} onClose={() => setDeleting(false)} />
      )}
    </div>
  )
}
