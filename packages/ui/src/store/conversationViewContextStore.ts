import { createStore } from "zustand/vanilla";
import type { ConversationContextSnapshot } from "@/v4/composer/contextAssembler.js";

type ViewContext = Omit<ConversationContextSnapshot, "capturedAt">;

interface Entry {
  owner: object;
  remoteSessionId?: string;
  value: ViewContext;
}

interface ConversationViewContextState {
  entries: Record<string, Entry>;
  publish: (workspaceKey: string, owner: object, value: ViewContext) => void;
  clear: (workspaceKey: string, owner: object) => void;
}

/** 窗格壳拥有本地可见状态；Composer 只在发送瞬间读取，不复制为会话事实。 */
export const conversationViewContextStore = createStore<ConversationViewContextState>((set) => ({
  entries: {},
  publish: (workspaceKey, owner, value) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [workspaceKey]: { owner, remoteSessionId: value.remoteSessionId, value },
      },
    })),
  clear: (workspaceKey, owner) =>
    set((state) => {
      if (state.entries[workspaceKey]?.owner !== owner) return state;
      const entries = { ...state.entries };
      delete entries[workspaceKey];
      return { entries };
    }),
}));

export function readConversationViewContext(
  workspacePath: string,
  workspaceIdentity?: string,
  remoteSessionId?: string,
): ConversationContextSnapshot | null {
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const entry = conversationViewContextStore.getState().entries[workspaceKey];
  if (!entry || entry.remoteSessionId !== remoteSessionId) return null;
  return { ...entry.value, capturedAt: new Date().toISOString() };
}
