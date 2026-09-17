"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react"
import { generateApiKey, revokeApiKey } from "@/app/actions/account"
import type { ActionState } from "@/lib/form-state"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Feedback, type ApiKeyRow } from "@/components/settings/shared"
import type { IntegrationsProps } from "./types"
const date = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value))

function CreateKeyDialog({
  workspace,
  workspaceId,
  onClose,
}: {
  workspace: string
  workspaceId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<ActionState & { secret?: string }>({})
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          setState({})
          onClose()
        }
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>
            {state.secret ? "Your API key is ready" : "Create API key"}
          </DialogTitle>
          <DialogDescription>
            {state.secret
              ? "Copy this key now. You won't be able to see it again."
              : `Give an application access to ${workspace}.`}
          </DialogDescription>
        </DialogHeader>
        {state.secret ? (
          <div className="space-y-5">
            <Field>
              <FieldLabel htmlFor="new-api-key">Your secret key</FieldLabel>
              <Input
                id="new-api-key"
                className="h-11 font-mono text-xs"
                readOnly
                value={state.secret}
              />
            </Field>
            <p className="text-sm leading-6 text-muted-foreground">
              Store it securely on your server. Anyone with this key can use the
              permissions you selected.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.secret!)
                    setCopied(true)
                  } catch {
                    setState({
                      ...state,
                      error:
                        "Copy isn't available. Select and copy the key manually.",
                    })
                  }
                }}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy key"}
              </Button>
              <Button
                onClick={() => {
                  setState({})
                  onClose()
                }}
              >
                Done
              </Button>
            </div>
            <Feedback state={state.error ? state : {}} />
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              start(async () => {
                try {
                  form.set("org_id", workspaceId)
                  const result = await generateApiKey(form)
                  setState(result)
                  if (result.secret) router.refresh()
                } catch {
                  setState({
                    error:
                      "Key creation couldn't be confirmed. Check the list before trying again.",
                  })
                }
              })
            }}
          >
            <Field>
              <FieldLabel htmlFor="key-name">Key name</FieldLabel>
              <Input
                id="key-name"
                name="name"
                placeholder="e.g. Production automation"
                minLength={2}
                maxLength={60}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="permission">Permissions</FieldLabel>
              <NativeSelect
                className="w-full"
                id="permission"
                name="permission"
                defaultValue="read"
              >
                <NativeSelectOption value="read">Read only</NativeSelectOption>
                <NativeSelectOption value="read_write">
                  Read and write
                </NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                Read workspace details. Write access also allows renaming this
                workspace.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="days">Expires in</FieldLabel>
              <NativeSelect id="days" name="days" defaultValue="90">
                <NativeSelectOption value="30">30 days</NativeSelectOption>
                <NativeSelectOption value="90">90 days</NativeSelectOption>
                <NativeSelectOption value="365">1 year</NativeSelectOption>
                <NativeSelectOption value="forever">Never</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Feedback state={state} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircle className="animate-spin" />}Create key
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
export function ApiKeys({
  now,
  keys,
  workspace,
  workspaceId,
  canManageKeys,
  apiUrl,
}: Pick<
  IntegrationsProps,
  "keys" | "workspace" | "workspaceId" | "canManageKeys" | "apiUrl" | "now"
>) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null)
  const [state, setState] = useState<ActionState>({})
  const [pending, start] = useTransition()
  return (
    <div className="space-y-6">
      <Card className="gap-0 py-0">
        <CardHeader className="gap-5 border-b px-6 py-6 sm:flex sm:items-center sm:justify-between md:px-8">
          <div>
            <CardTitle>Workspace API keys</CardTitle>
            <CardDescription className="mt-2">
              Connect your scripts and services to {workspace}.
            </CardDescription>
          </div>
          {canManageKeys && (
            <Button className="self-start" onClick={() => setCreating(true)}>
              <Plus />
              Create API key
            </Button>
          )}
        </CardHeader>
        {!canManageKeys ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>Managed by your workspace</EmptyTitle>
              <EmptyDescription>
                Only owners and admins can create and manage API keys.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : !keys.length ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound />
              </EmptyMedia>
              <EmptyTitle>Your first connection starts here</EmptyTitle>
              <EmptyDescription>
                Create a key to read workspace details or update its name from
                your own tools.
              </EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              Create your first key
            </Button>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6 md:pl-8">Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="pr-6 text-right">Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const expired =
                  key.expires_at !== null &&
                  new Date(key.expires_at).getTime() <= now
                const inactive = Boolean(key.revoked_at) || expired
                return (
                  <TableRow key={key.id}>
                    <TableCell className="py-5 pl-6 md:pl-8">
                      <p className="font-medium">{key.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {key.prefix}••••••
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created {date(key.created_at)}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.permission === "read" ? "Read only" : "Read & write"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.last_used_at ? date(key.last_used_at) : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.expires_at === null ? "Never" : date(key.expires_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={inactive ? "outline" : "secondary"}>
                        {key.revoked_at
                          ? "Revoked"
                          : expired
                            ? "Expired"
                            : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={inactive}
                        aria-label={`Revoke ${key.name}`}
                        onClick={() => {
                          setState({})
                          setRevoking(key)
                        }}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        <div className="border-t bg-muted/20 px-6 py-4 text-xs leading-5 text-muted-foreground md:px-8">
          Keys belong to this workspace. Up to 20 active keys · 60 requests per
          minute per key.
        </div>
      </Card>
      <Feedback state={state} />
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm">Make your first request</CardTitle>
          <CardDescription>
            Save your API key as WORKSPACE_API_KEY in the environment where your
            script runs. The example below uses it to read this workspace. Keep
            the key private.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-6">
            <code>{`curl "${apiUrl}" \\\n  -H "Authorization: Bearer $WORKSPACE_API_KEY"`}</code>
          </pre>
        </CardContent>
      </Card>
      {creating && (
        <CreateKeyDialog
          workspace={workspace}
          workspaceId={workspaceId}
          onClose={() => setCreating(false)}
        />
      )}
      <AlertDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => {
          if (!open && !pending) setRevoking(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Applications using this key will immediately lose access. You can
              create a replacement, but this key cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Feedback state={state.error ? state : {}} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep key</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (revoking)
                  start(async () => {
                    try {
                      const result = await revokeApiKey(
                        revoking.id,
                        workspaceId
                      )
                      setState(result)
                      if (result.success) {
                        setRevoking(null)
                        router.refresh()
                      }
                    } catch {
                      setState({ error: "Key couldn't be revoked. Try again." })
                    }
                  })
              }}
            >
              {pending && <LoaderCircle className="animate-spin" />}Revoke key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
