"use server"

import { deliverContact } from "@/lib/email/contact.mjs"
import type { ActionState } from "@/lib/form-state"

export async function sendContact(
  _previous: ActionState,
  form: FormData
): Promise<ActionState> {
  return deliverContact({
    name: form.get("name"),
    email: form.get("email"),
    topic: form.get("topic"),
    message: form.get("message"),
    website: form.get("website") || "",
  })
}
