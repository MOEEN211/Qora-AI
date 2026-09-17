"use client"
import { useActionState } from "react"
import { LoaderCircle, CircleAlert, CircleCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ActionState } from "@/lib/form-state"
export function ActionForm({
  action,
  children,
  label,
  pendingLabel = "Saving…",
  disabled = false,
  className = "",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>
  children: React.ReactNode
  label: string
  pendingLabel?: string
  disabled?: boolean
  className?: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction} className={`space-y-5 ${className}`}>
      {children}
      {state.error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert role="status">
          <CircleCheck />
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        disabled={pending || disabled}
        className="h-11 w-full"
        aria-busy={pending}
      >
        {pending && <LoaderCircle className="animate-spin" />}
        {pending ? pendingLabel : label}
      </Button>
    </form>
  )
}
