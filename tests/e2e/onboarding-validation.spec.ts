import { test, expect } from "@playwright/test"
import { onboardingSchema, onboardingDestination } from "../../lib/onboarding"

test("onboarding validation accepts incomplete skips and rejects malformed completion or external continuations", () => {
  const draft = {
    display_name: "",
    use_case: null,
    interests: [],
    current_step: 1,
    status: "in_progress",
  }
  expect(onboardingSchema.safeParse(draft).success).toBe(true)
  expect(
    onboardingSchema.safeParse({ ...draft, current_step: 2 }).success
  ).toBe(false)
  expect(
    onboardingSchema.safeParse({ ...draft, status: "skipped" }).success
  ).toBe(true)
  expect(
    onboardingSchema.safeParse({ ...draft, status: "completed" }).success
  ).toBe(false)
  expect(
    onboardingSchema.safeParse({ ...draft, user_id: "another-user" }).success
  ).toBe(false)
  expect(
    onboardingSchema.safeParse({
      ...draft,
      display_name: "A",
      use_case: "work",
      current_step: 3,
      status: "completed",
    }).success
  ).toBe(true)
  const consent = "/oauth/consent?authorization_id=opaque_provider_id_1234"
  expect(onboardingDestination(consent)).toBe(consent)
  for (const destination of [
    "https://example.com",
    "//example.com",
    "/dashboard?redirect=evil",
    "/oauth/consent?authorization_id=short",
    consent + "&redirect=evil",
  ])
    expect(onboardingDestination(destination)).toBe("/dashboard")
})
