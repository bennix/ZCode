import type { WorkspaceSidePaneState } from "@/lib/workspaceSidePane.js";
import type { ConversationContextSnapshot, VisibleWidget } from "@/v4/composer/contextAssembler.js";

export interface VisibleContextSource {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  isVisible: boolean;
  sidePaneState: WorkspaceSidePaneState | null;
  git?: { repoRoot: string; branchName: string | null; isDirty: boolean; isGitAvailable: boolean };
}

export function deriveVisibleContextSnapshot(
  source: VisibleContextSource,
): Omit<ConversationContextSnapshot, "capturedAt"> {
  const activeTab = source.isVisible
    ? source.sidePaneState?.tabs.find((tab) => tab.id === source.sidePaneState?.activeTabId)
    : undefined;
  const widgets: VisibleWidget[] = [];
  let activeFile: ConversationContextSnapshot["activeFile"];
  if (activeTab?.type === "code-viewer") {
    const path = activeTab.source.path;
    if (path) activeFile = { path };
    if (activeTab.source.type === "patch" || activeTab.source.type === "multi-file-diff") {
      widgets.push({ kind: "diff", tabId: activeTab.id, ...(path ? { filePath: path } : {}) });
    }
  } else if (activeTab?.type === "git") {
    widgets.push({ kind: "diff", tabId: activeTab.id });
  } else if (activeTab?.type === "terminal") {
    widgets.push({ kind: "terminal", tabId: activeTab.id });
  } else if (
    activeTab?.type === "browser" &&
    activeTab.residency !== "suspended" &&
    activeTab.residency !== "suspend-pending"
  ) {
    widgets.push({
      kind: "web_preview",
      tabId: activeTab.id,
      ...(activeTab.title ? { title: activeTab.title } : {}),
    });
  }
  return {
    workspacePath: source.workspacePath,
    ...(source.workspaceIdentity ? { workspaceIdentity: source.workspaceIdentity } : {}),
    ...(source.remoteSessionId ? { remoteSessionId: source.remoteSessionId } : {}),
    ...(activeFile ? { activeFile } : {}),
    ...(source.git?.isGitAvailable
      ? {
          git: {
            worktreePath: source.git.repoRoot,
            ...(source.git.branchName ? { branch: source.git.branchName } : {}),
            dirty: source.git.isDirty,
          },
        }
      : {}),
    widgets,
  };
}
