"use client"
import { useState } from "react"
import { Check, Eye, EyeOff } from "lucide-react"
import type { ActionState } from "@/lib/form-state"
import type { BillingData } from "@/lib/billing/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group"

export type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  permission: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}
export type Deletion = {
  personal_workspaces: string[]
  blocked_workspaces: string[]
}
export type SettingsProps = {
  preferences: { email_enabled: boolean; in_app_enabled: boolean }
  billing: BillingData
  initialTab?: string
  name: string
  email: string
  avatarUrl: string | null
  workspace: string
  workspaceId: string
  deletion: Deletion
}
export function Feedback({ state }: { state: ActionState }) {
  return state.error || state.success ? (
    <Alert
      variant={state.error ? "destructive" : "default"}
      role={state.error ? "alert" : "status"}
    >
      {!state.error && <Check />}
      <AlertDescription>{state.error || state.success}</AlertDescription>
    </Alert>
  ) : null
}
export function PasswordField({
  name,
  label,
  current = false,
}: {
  name: string
  label: string
  current?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <InputGroup className="h-11">
        <InputGroupInput
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={current ? "current-password" : "new-password"}
          minLength={current ? undefined : 12}
          maxLength={128}
          required
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            onClick={() => setVisible(!visible)}
            size="icon-sm"
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}
export function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-6 px-6 py-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12 md:px-8">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
