import { createContext } from "react";
export const CodeWorkbenchLayoutContext = createContext(false);

/** IDE tab 是布局事实的唯一来源；显式返回只压制该 tab 的聚焦显示。 */
export function shouldFocusCodeWorkbench(input: {
  activeTab: { id: string; type: string; purpose?: string } | null | undefined;
  suppressedTabId: string | null;
  sidePaneVisible: boolean;
}): boolean {
  return Boolean(
    input.sidePaneVisible &&
    input.activeTab?.type === "browser" &&
    input.activeTab.purpose === "code-workbench" &&
    input.activeTab.id !== input.suppressedTabId,
  );
}

/** 窗口 resize 的窄会话自动折叠只属于普通会话布局；IDE 中的 AI 停靠区本来就窄。 */
export function shouldAutoCollapseConversationSidePane(input: {
  widthPx: number;
  thresholdPx: number;
  isSidePaneOpen: boolean;
  isWorkbenchFocused: boolean;
}): boolean {
  return input.isSidePaneOpen && !input.isWorkbenchFocused && input.widthPx < input.thresholdPx;
}

/** IDE 聚焦态只保留浮动 AI 标题栏，避免普通工作区 Header 容器留下空白占位。 */
export function shouldShowWorkspaceHeader(input: {
  mainViewHasHeader: boolean;
  workbenchFocused: boolean;
  hasActiveTask: boolean;
  desktop: boolean;
}): boolean {
  return (
    input.mainViewHasHeader && !input.workbenchFocused && (input.hasActiveTask || input.desktop)
  );
}
