import { createConversationTelemetryService } from "@zcode/services";
import { useEffect } from "react";
import { readProbeScope, useResearchProbeStore } from "@/store/researchProbeStore.js";
import { useZCodeAgentService } from "./useZCodeAgentService.js";

/** 只消费既有 telemetry，不建立 session、不改变 runtime 或 replay 链路。 */
export function useResearchProbe(
  workspacePath: string,
  workspaceIdentity?: string,
  remoteSessionId?: string,
) {
  const service = useZCodeAgentService(workspacePath, remoteSessionId, workspaceIdentity);
  const scopeKey = workspaceIdentity?.trim() || workspacePath;
  const enabled = useResearchProbeStore(
    (state) => state.scopes[scopeKey]?.enabled["guided-task"] ?? false,
  );
  const epoch = useResearchProbeStore(
    (state) => state.scopes[scopeKey]?.epochs["guided-task"] ?? 0,
  );
  useEffect(() => {
    if (!enabled || !workspacePath || workspaceIdentity?.trim() || remoteSessionId) return;
    const turnLabels = new Map<string, { caseId: string; condition: string }>();
    const subscription = createConversationTelemetryService(service).onFact({
      workspacePath,
      workspaceIdentity,
    })((fact) => {
      const scope = readProbeScope(scopeKey);
      const turnKey = `${fact.sessionId}/${fact.turnId ?? "unknown"}`;
      if (fact.kind === "turn.started")
        turnLabels.set(turnKey, { caseId: scope.caseId, condition: scope.condition });
      if (
        fact.kind !== "usage.delta" &&
        fact.kind !== "turn.terminal" &&
        fact.kind !== "tool.lifecycle"
      )
        return;
      if (fact.kind === "tool.lifecycle" && fact.phase !== "failed") return;
      const labels = turnLabels.get(turnKey) ?? {
        caseId: scope.caseId,
        condition: scope.condition,
      };
      useResearchProbeStore.getState().append(scopeKey, epoch, {
        id: `${fact.sessionId}/${fact.eventId}`,
        track: "guided-task",
        ...labels,
        operation: fact.kind,
        source: "runtime-live",
        startedAt: fact.occurredAt,
        durationMs: fact.kind === "turn.terminal" ? (fact.durationMs ?? null) : null,
        status:
          fact.kind === "turn.terminal"
            ? ({ success: "success", failed: "failed", interrupted: "cancelled" } as const)[
                fact.status
              ]
            : fact.kind === "tool.lifecycle"
              ? "failed"
              : "observed",
        model: fact.kind === "usage.delta" ? (fact.modelId ?? null) : null,
        inputTokens: fact.kind === "usage.delta" ? fact.inputTokens : null,
        outputTokens: fact.kind === "usage.delta" ? fact.outputTokens : null,
        retries: null,
        usageCoverage: fact.kind === "usage.delta" ? "complete" : "unknown",
      });
      if (fact.kind === "turn.terminal") turnLabels.delete(turnKey);
    });
    return () => subscription.dispose();
  }, [enabled, epoch, remoteSessionId, scopeKey, service, workspaceIdentity, workspacePath]);
}
