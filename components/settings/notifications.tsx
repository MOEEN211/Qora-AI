"use client"
import { useState, useTransition } from "react"
import { Mail, Bell } from "lucide-react"
import { updateNotificationPreference } from "@/app/actions/notification-preferences"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Feedback, Section } from "./shared"
import type { ActionState } from "@/lib/form-state"

export type NotificationPreferences = {
  email_enabled: boolean
  in_app_enabled: boolean
}

function Preference({
  channel,
  initial,
  title,
  description,
  icon: Icon,
}: {
  channel: keyof NotificationPreferences
  initial: boolean
  title: string
  description: string
  icon: typeof Mail
}) {
  const [enabled, setEnabled] = useState(initial)
  const [state, setState] = useState<ActionState>({})
  const [pending, start] = useTransition()
  return (
    <div className="py-6 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={channel} className="leading-5">
            {title}
          </Label>
          <p
            id={`${channel}-description`}
            className="text-sm leading-6 text-muted-foreground"
          >
            {description}
          </p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {pending ? "Saving…" : enabled ? "On" : "Off"}
          </p>
        </div>
        <Switch
          id={channel}
          checked={enabled}
          disabled={pending}
          aria-describedby={`${channel}-description`}
          className="mt-1"
          onCheckedChange={(next) => {
            start(async () => {
              setState({})
              try {
                const result = await updateNotificationPreference(channel, next)
                if (result.success) setEnabled(next)
                setState(result)
              } catch {
                setState({
                  error: "Your preference couldn't be saved. Please try again.",
                })
              }
            })
          }}
        />
      </div>
      {(state.error || state.success) && (
        <div className="mt-4">
          <Feedback state={state} />
        </div>
      )}
    </div>
  )
}

export function Notifications({
  preferences,
}: {
  preferences: NotificationPreferences
}) {
  return (
    <div className="space-y-5">
      <Card className="gap-0 py-0">
        <Section
          title="Stay in the loop"
          description="Choose how you hear from us. These preferences apply to your account across all workspaces."
        >
          <div className="divide-y">
            <Preference
              channel="email_enabled"
              initial={preferences.email_enabled}
              title="Email notifications"
              icon={Mail}
              description="Receive welcome emails, workspace invitations, and updates in your inbox."
            />
            <Preference
              channel="in_app_enabled"
              initial={preferences.in_app_enabled}
              title="In-app notifications"
              icon={Bell}
              description="Receive notifications inside the app. Find them using the bell in the header."
            />
          </div>
        </Section>
      </Card>
      <p className="px-1 text-xs leading-6 text-muted-foreground">
        Changes save automatically. Email verification and password-reset emails
        remain available. Turning off in-app notifications keeps the
        notifications you already have.
      </p>
    </div>
  )
}
