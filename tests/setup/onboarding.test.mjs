import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOnboarding } from '../../scripts/kickstart/onboarding.mjs';

test('onboarding verification rejects missing permissions, triggers and backfill', async () => {
  const ready = { protected_table: true, signup_trigger: true, transition_trigger: true, protected_functions: 2, backfilled: true };
  await verifyOnboarding({ query: async () => [ready] });
  for (const field of Object.keys(ready)) {
    await assert.rejects(verifyOnboarding({ query: async () => [{ ...ready, [field]: false }] }), /Onboarding storage/);
  }
});
