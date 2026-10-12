import assert from "node:assert/strict";
import test from "node:test";
import { resolveWeixinFileSelectionReply } from "../src/bots/weixinFileSelection.ts";

const selection = {
  id: "plan-1",
  token: "abc123def456",
  requiresToken: true,
  title: "Files",
  action: "elicitation.respond",
  options: [
    { id: "src/a.ts", label: "src/a.ts" },
    { id: "src/b.ts", label: "src/b.ts" },
  ],
} as const;

test("Weixin file choices bind to the current request token", () => {
  assert.deepEqual(resolveWeixinFileSelectionReply(selection as never, "abc123def456 2"), {
    kind: "choice",
    value: "abc123def456 src/b.ts",
  });
  assert.deepEqual(resolveWeixinFileSelectionReply(selection as never, "abc123def456 0"), {
    kind: "cancel",
  });
  for (const text of ["2", "0", "old123def456 2", "abc123def456 3", "abc123def456 2 extra"]) {
    assert.equal(resolveWeixinFileSelectionReply(selection as never, text), null);
  }
});
