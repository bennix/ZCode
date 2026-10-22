import type { ModelMessageContent, ToolResultBudget, TraceContext } from "@zcode/contracts";
import type { ToolEntry } from "../types.js";
import { formatGenericPersistedOutputContent } from "../result-persistence-format.js";
import type { ToolExecutorDeps } from "./types.js";

export async function tryWriteToolArtifact(
  deps: ToolExecutorDeps,
  content: string,
  contentType: string,
  entry: ToolEntry,
  budget: ToolResultBudget,
  traceContext: TraceContext,
  toolCallId: string,
  signal: AbortSignal,
): Promise<{ path?: string; uri: string } | undefined> {
  if (!deps.artifactStore) return undefined;
  try {
    return await deps.artifactStore.writeToolResultArtifact(
      {
        sessionId: deps.sessionId,
        turnId: traceContext.turnId ?? deps.turnId,
        toolCallId,
        toolName: entry.metadata.name,
        content,
        contentType,
        retention: budget.artifact?.retention ?? "session",
        trace: traceContext,
      },
      { signal },
    );
  } catch {
    // 与主模型交互时，artifact 写入失败不应让一次成功的工具调用变成失败。
    // 保持既有 resultBudget 回退语义；新的压缩投影没有可读原文时也不能启用。
    return undefined;
  }
}

export function formatPersistedOutputContent(input: {
  content: string;
  entry: ToolEntry;
  originalBytes: number;
  output: unknown;
  persistedPath: string;
}): ModelMessageContent {
  const projected = input.entry.formatPersistedModelContent?.({
    content: input.content,
    originalBytes: input.originalBytes,
    output: input.output,
    persistedPath: input.persistedPath,
  });
  if (projected !== undefined) return projected;
  return formatGenericPersistedOutputContent({
    content: input.content,
    originalBytes: input.originalBytes,
    persistedPath: input.persistedPath,
  });
}
