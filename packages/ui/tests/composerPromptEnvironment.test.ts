import assert from "node:assert/strict";
import test from "node:test";
import {
  parseComposerPromptContexts,
  serializeComposerPromptContexts,
} from "../src/v4/composer/composerPromptContexts.ts";

test("environment block is sent last and hidden from the history user row", () => {
  const message = serializeComposerPromptContexts("Fix the visible issue", {
    codeComments: [],
    conversationSelections: [],
    webElements: [],
    pptxElements: [],
    environment: {
      workspacePath: "/work/project",
      capturedAt: "2026-10-12T00:00:00.000Z",
      git: { worktreePath: "/work/project", branch: "feature/a" },
      widgets: [{ kind: "terminal", tabId: "terminal-1" }],
    },
  });
  assert.match(message, /<widget_context_hint>/u);
  const parsed = parseComposerPromptContexts(message, { workspacePath: "/work/project" });
  assert.equal(parsed.visibleContent, "Fix the visible issue");
  assert.match(parsed.environmentBlock ?? "", /feature\/a/u);
  assert.equal(parsed.codeComments.length, 0);
});
