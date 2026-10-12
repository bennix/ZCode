import assert from "node:assert/strict";
import test from "node:test";
import { deriveVisibleContextSnapshot } from "../src/app-shell/visibleContextSnapshot.ts";
import type { WorkspaceSidePaneState } from "../src/lib/workspaceSidePane.ts";

test("only the active visible side tab enters the snapshot", () => {
  const sidePaneState = {
    activeTabId: "preview",
    tabs: [
      { id: "hidden", type: "terminal", title: "shell" },
      {
        id: "preview",
        type: "code-viewer",
        source: { type: "patch", title: "Diff", path: "src/a.ts", patch: "@@" },
        sourceKey: "src/a.ts",
      },
    ],
  } as WorkspaceSidePaneState;
  const source = {
    workspacePath: "/work/project",
    isVisible: true,
    sidePaneState,
    git: {
      repoRoot: "/work/project",
      branchName: "feature/a",
      isDirty: true,
      isGitAvailable: true,
    },
  };
  const visible = deriveVisibleContextSnapshot(source);
  assert.deepEqual(visible.activeFile, { path: "src/a.ts" });
  assert.deepEqual(visible.widgets, [{ kind: "diff", tabId: "preview", filePath: "src/a.ts" }]);
  assert.equal(visible.git?.branch, "feature/a");
  assert.deepEqual(deriveVisibleContextSnapshot({ ...source, isVisible: false }).widgets, []);
});

test("browser tab does not claim its initial URL is the current page", () => {
  const snapshot = deriveVisibleContextSnapshot({
    workspacePath: "/work/project",
    isVisible: true,
    sidePaneState: {
      activeTabId: "browser",
      tabs: [
        {
          id: "browser",
          type: "browser",
          title: "Current page",
          initialUrl: "https://old.example",
        },
      ],
    },
  });
  assert.deepEqual(snapshot.widgets, [
    { kind: "web_preview", tabId: "browser", title: "Current page" },
  ]);
});
