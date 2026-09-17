import test from "node:test";
import assert from "node:assert/strict";
import { verifyNotifications } from "../../scripts/kickstart/notifications.mjs";

test("notification verification rejects incomplete storage, grants, trigger, uniqueness and backfill", async () => {
  const ready = { protected_table: true, signup_trigger: true, protected_functions: 2, welcome_unique: true, backfilled: true };
  await verifyNotifications({ query: async () => [ready] });
  for (const field of Object.keys(ready)) {
    await assert.rejects(verifyNotifications({ query: async () => [{ ...ready, [field]: false }] }), /Notification storage/);
  }
});
