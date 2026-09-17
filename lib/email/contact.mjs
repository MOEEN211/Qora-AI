import { createHash } from "node:crypto"
import { z } from "zod"

export const contactTopics = [
  "General question",
  "Getting started",
  "Plans & billing",
  "Something else",
]
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name (at least 2 characters).")
    .max(100),
  email: z.email("Enter a valid email address.").max(254),
  topic: z.enum(contactTopics),
  message: z
    .string()
    .trim()
    .min(20, "Add a little more detail (at least 20 characters).")
    .max(5000, "Keep your message under 5,000 characters."),
  website: z.string().max(0, "Your message could not be submitted."),
})

// A bounded process-local backstop. Public deployments also need an edge rate
// limit; this does not claim to enforce a quota across serverless instances.
const attempts = new Map()
export async function deliverContact(
  input,
  env = process.env,
  fetcher = fetch,
  now = Date.now()
) {
  const result = schema.safeParse(input)
  if (!result.success) return { error: result.error.issues[0].message }
  if (
    !env.RESEND_API_KEY ||
    !env.RESEND_FROM_EMAIL ||
    !z.email().safeParse(env.CONTACT_TO_EMAIL).success
  ) {
    return {
      error: "The contact form is not available yet. Please try again later.",
    }
  }
  const { name, email, topic, message } = result.data
  const payload = {
    from: env.RESEND_FROM_EMAIL,
    to: [env.CONTACT_TO_EMAIL],
    reply_to: email,
    subject: `Contact: ${topic}`,
    text: `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`,
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
  for (const [key, value] of attempts)
    if (value.reset <= now) attempts.delete(key)
  const emailKey = createHash("sha256")
    .update(email.toLowerCase())
    .digest("hex")
  const recent = attempts.get(emailKey) || { count: 0, reset: now + 600000 }
  const total = attempts.get("global") || { count: 0, reset: now + 3600000 }
  if (recent.count >= 3 || total.count >= 20)
    return {
      error: "Too many messages. Please wait a while before trying again.",
    }
  attempts.set(emailKey, { ...recent, count: recent.count + 1 })
  attempts.set("global", { ...total, count: total.count + 1 })
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `contact-${digest}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    if (response.ok && (await response.json()).id)
      return {
        success:
          "Your message has been sent. We’ll reply to the email you provided.",
      }
  } catch {
    /* Keep message contents, recipients, and provider details out of logs. */
  }
  return {
    error:
      "We couldn’t confirm your message was sent. Please try again with the same details.",
  }
}
