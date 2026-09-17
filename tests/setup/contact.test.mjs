import { test } from "node:test"
import assert from "node:assert/strict"
import { deliverContact } from "../../lib/email/contact.mjs"

const input = {
  name: "Example Visitor",
  email: "visitor@example.com",
  topic: "General question",
  message: "Can you help me get my workspace set up?",
  website: "",
}
const env = {
  RESEND_API_KEY: "test-only",
  RESEND_FROM_EMAIL: "sender@example.com",
  CONTACT_TO_EMAIL: "inbox@example.com",
}

test("contact rejects invalid, bot, and unconfigured submissions without sending", async () => {
  const noSend = async () => {
    assert.fail("must not send")
  }
  for (const change of [
    { email: "invalid" },
    { message: "short" },
    { message: "x".repeat(5001) },
    { topic: "injected" },
    { website: "bot" },
  ]) {
    assert.ok(
      (await deliverContact({ ...input, ...change }, env, noSend)).error
    )
  }
  assert.ok((await deliverContact(input, {}, noSend)).error)
})

test("contact fixes destination, uses reply-to and deduplicates uncertain retries", async () => {
  const sent = []
  const fetcher = async (_url, options) => {
    sent.push(options)
    if (sent.length === 1) throw new Error("timeout")
    return Response.json({ id: "fake-accepted-id" })
  }
  assert.ok((await deliverContact(input, env, fetcher, 1000000)).error)
  assert.ok((await deliverContact(input, env, fetcher, 1000001)).success)
  assert.equal(
    sent[0].headers["Idempotency-Key"],
    sent[1].headers["Idempotency-Key"]
  )
  const payload = JSON.parse(sent[1].body)
  assert.deepEqual(payload.to, [env.CONTACT_TO_EMAIL])
  assert.equal(payload.reply_to, input.email)
  assert.equal(payload.from, env.RESEND_FROM_EMAIL)
  assert.equal(payload.html, undefined)
})

test("contact limits attempts and never reports provider rejection as success", async () => {
  const visitor = { ...input, email: "limited@example.com" }
  let calls = 0
  const reject = async () => {
    calls++
    return Response.json({ message: "private provider error" }, { status: 403 })
  }
  for (let count = 0; count < 4; count++)
    assert.ok((await deliverContact(visitor, env, reject, 2000000)).error)
  assert.equal(calls, 3)
})
