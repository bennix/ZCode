import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAiSdkModelRetryOptions } from "../src/model/retry-policy.js";

test("ordinary requests stop after the initial attempt and two retries", () => {
  assert.equal(resolveAiSdkModelRetryOptions(undefined, {}).maxAttempts, 3);
});

test("explicit retry counts keep zero retries and user-selected budgets", () => {
  for (const [retries, attempts] of [["0", 1], ["1", 2], ["10", 11]] as const) {
    assert.equal(resolveAiSdkModelRetryOptions(undefined, {
      ZCODE_MODEL_RETRY_MAX_RETRIES: retries,
    }).maxAttempts, attempts);
  }
  assert.equal(resolveAiSdkModelRetryOptions({ maxAttempts: 5 }, {
    ZCODE_MODEL_RETRY_MAX_RETRIES: "0",
  }).maxAttempts, 5);
});

test("invalid environment retry counts use the reduced default", () => {
  for (const value of ["", "invalid", "-1", "Infinity"]) {
    assert.equal(resolveAiSdkModelRetryOptions(undefined, {
      ZCODE_MODEL_RETRY_MAX_RETRIES: value,
    }).maxAttempts, 3);
  }
});
