import { useState } from "react";

export type ComposerWorkspaceEntry =
  | "conversation"
  | "workcoder"
  | "probes"
  | "workspace"
  | "studio";

/** 多个独立布尔值会让探针和 WorkCoder 同时展开；使用单一入口状态保证互斥。 */
export function useComposerWorkspaceNavigation() {
  const [entry, setEntry] = useState<ComposerWorkspaceEntry>("conversation");
  const [workcoderVisited, setWorkcoderVisited] = useState(false);
  const select = (next: ComposerWorkspaceEntry) => {
    if (next === "workcoder") setWorkcoderVisited(true);
    setEntry(next);
  };
  const toggle = (next: ComposerWorkspaceEntry) => {
    if (next === "workcoder") setWorkcoderVisited(true);
    setEntry((current) => (current === next ? "conversation" : next));
  };
  const completeWorkcoder = () => {
    setEntry("conversation");
    setWorkcoderVisited(false);
  };
  return { entry, workcoderVisited, select, toggle, completeWorkcoder };
}
