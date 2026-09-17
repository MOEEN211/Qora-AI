import { ActionForm } from "@/components/action-form"
import { resetPassword } from "@/app/actions/auth"
import { requireUser } from "@/lib/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
export const metadata = { title: "Choose a password" }
export default async function Reset() {
  await requireUser()
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">A new password.</h1>
      <p className="mt-3 mb-8 text-sm text-muted-foreground">
        Use at least 12 characters to keep your account secure.
      </p>
      <ActionForm action={resetPassword} label="Update password">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirm new password</Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
      </ActionForm>
    </>
  )
}
