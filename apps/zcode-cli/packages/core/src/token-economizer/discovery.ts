import type { ToolEntry } from "../tool/types.js";

export const DISCOVER_TOOLS = "DiscoverTools";

/** 只恢复定义，不执行目标工具；实际调用仍通过原有权限检查。 */
export function discoveryEntry(discover: (query: string) => string[]): ToolEntry {
  return {
    capability: "Restore deferred tool definitions",
    metadata: {
      name: DISCOVER_TOOLS,
      description:
        "Find deferred tools by keyword or tool name. Definitions become available on the next request. Use an empty query to restore all. This does not execute tools or grant permissions.",
      readOnly: true,
      destructive: false,
      concurrentSafe: true,
      allowedInPlanMode: true,
      sideEffectScope: "session",
      riskLevel: "low",
      needsApproval: false,
    },
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", maxLength: 256 } },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { restored: { type: "array", items: { type: "string" } } },
      required: ["restored"],
    },
    handler: async (input) => {
      const query = (input as { query?: unknown })?.query;
      if (typeof query !== "string" || query.length > 256)
        throw new Error("query must be a string of at most 256 characters");
      return { restored: discover(query) };
    },
    permission: {
      permission: "tools.discover",
      reason: "Restore visible tool definitions without executing them",
      riskLevel: "low",
      sideEffectScope: "session",
      needsApproval: false,
      patternSources: ["toolName"],
      denyPriority: "beforeAsk",
    },
    resultBudget: { maxInlineBytes: 16000, maxModelBytes: 16000, strategy: "truncate" },
    timeout: { defaultMs: 1000, maxMs: 1000, allowCallOverride: false },
    cancellation: {
      supported: true,
      cleanup: "none",
      userVisibleMessage: "Tool discovery cancelled",
    },
    trace: {
      required: true,
      propagateToAdapters: false,
      recordInput: "summary",
      recordOutput: "summary",
    },
  };
}
