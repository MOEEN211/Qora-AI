import test from "node:test";
import assert from "node:assert/strict";
import { functionReceipt, matchesFunctionReceipt } from "../../scripts/kickstart/core.mjs";

test("secret-triggered version changes require the same verified bundle checksum", () => {
  const fn = { slug: "owned-function", version: 2, verify_jwt: false, status: "ACTIVE", ezbr_sha256: "a".repeat(64) };
  const receipt = functionReceipt(fn);
  assert.equal(matchesFunctionReceipt({ ...fn, version: 3 }, receipt), true);
  for (const change of [{ ezbr_sha256: "b".repeat(64) }, { ezbr_sha256: undefined }, { version: 1 }, { slug: "other" }, { verify_jwt: true }, { status: "REMOVED" }]) {
    assert.equal(matchesFunctionReceipt({ ...fn, ...change }, receipt), false);
  }
  const legacy = { slug: fn.slug, version: 2 };
  assert.equal(matchesFunctionReceipt(fn, legacy), true);
  assert.equal(matchesFunctionReceipt({ ...fn, version: 3 }, legacy), false);
  assert.equal(matchesFunctionReceipt(fn, undefined), false);
});
