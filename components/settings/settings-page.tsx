"use client"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { General } from "./general"
import { Security } from "./security"
import { Billing } from "./billing"
import { Notifications } from "./notifications"
import type { SettingsProps } from "./shared"

export function SettingsPage(props: SettingsProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your profile, security, notifications, and billing.
        </p>
      </div>
      <Tabs defaultValue={props.initialTab || "general"} className="gap-8">
        <TabsList
          aria-label="Settings sections"
          className="max-w-full [&>[data-slot=tabs-trigger]]:px-3 sm:[&>[data-slot=tabs-trigger]]:px-4"
        >
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <General {...props} />
        </TabsContent>
        <TabsContent value="security">
          <Security deletion={props.deletion} />
        </TabsContent>
        <TabsContent value="billing">
          <Billing key={props.billing.workspaceId} data={props.billing} />
        </TabsContent>
        <TabsContent value="notifications">
          <Notifications preferences={props.preferences} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
