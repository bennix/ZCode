import { create } from "zustand";

export type ProbeTrack = "guided-task" | "local-edit";
export type ProbeStatus = "success" | "failed" | "cancelled" | "observed";
export interface ProbeRecord {
  id: string;
  track: ProbeTrack;
  caseId: string;
  condition: string;
  operation: string;
  source: "ui" | "runtime-live";
  startedAt: number;
  durationMs: number | null;
  status: ProbeStatus;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  retries: number | null;
  usageCoverage: "complete" | "partial" | "unknown";
}
interface ProbeScope {
  enabled: Record<ProbeTrack, boolean>;
  epochs: Record<ProbeTrack, number>;
  caseId: string;
  condition: string;
  records: ProbeRecord[];
  dropped: number;
}
const empty = (): ProbeScope => ({
  enabled: { "guided-task": false, "local-edit": false },
  epochs: { "guided-task": 0, "local-edit": 0 },
  caseId: "pilot",
  condition: "default",
  records: [],
  dropped: 0,
});
const EMPTY = empty();
const LIMIT = 2000;
interface ProbeStore {
  scopes: Record<string, ProbeScope>;
  configure: (scope: string, patch: Partial<Pick<ProbeScope, "caseId" | "condition">>) => void;
  toggle: (scope: string, track: ProbeTrack, enabled: boolean) => void;
  append: (scope: string, epoch: number, record: ProbeRecord) => void;
  clear: (scope: string) => void;
}
export const useResearchProbeStore = create<ProbeStore>((set) => ({
  scopes: {},
  configure: (key, patch) =>
    set((state) => ({
      scopes: { ...state.scopes, [key]: { ...(state.scopes[key] ?? empty()), ...patch } },
    })),
  toggle: (key, track, enabled) =>
    set((state) => {
      const scope = state.scopes[key] ?? empty();
      return {
        scopes: {
          ...state.scopes,
          [key]: {
            ...scope,
            enabled: { ...scope.enabled, [track]: enabled },
            epochs: { ...scope.epochs, [track]: scope.epochs[track] + 1 },
          },
        },
      };
    }),
  append: (key, epoch, record) =>
    set((state) => {
      const scope = state.scopes[key];
      if (
        !scope?.enabled[record.track] ||
        scope.epochs[record.track] !== epoch ||
        scope.records.some((item) => item.id === record.id)
      )
        return state;
      const records = [...scope.records, record];
      return {
        scopes: {
          ...state.scopes,
          [key]: {
            ...scope,
            records: records.slice(-LIMIT),
            dropped: scope.dropped + Math.max(0, records.length - LIMIT),
          },
        },
      };
    }),
  clear: (key) =>
    set((state) => {
      const scope = state.scopes[key] ?? empty();
      return {
        scopes: {
          ...state.scopes,
          [key]: {
            ...scope,
            records: [],
            dropped: 0,
            epochs: {
              "guided-task": scope.epochs["guided-task"] + 1,
              "local-edit": scope.epochs["local-edit"] + 1,
            },
          },
        },
      };
    }),
}));
export function readProbeScope(key: string): ProbeScope {
  return useResearchProbeStore.getState().scopes[key] ?? EMPTY;
}
export function startProbe(
  scope: string,
  track: ProbeTrack,
  operation: string,
  model: string | null = null,
) {
  const snapshot = readProbeScope(scope);
  const enabled = snapshot.enabled[track];
  const epoch = snapshot.epochs[track];
  const startedAt = Date.now();
  const clock = performance.now();
  let finished = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let reports = 0;
  const finish = (status: ProbeStatus, retries: number | null = null) => {
    if (!enabled || finished) return;
    finished = true;
    useResearchProbeStore.getState().append(scope, epoch, {
      id: crypto.randomUUID(),
      track,
      operation,
      model,
      source: "ui",
      startedAt,
      durationMs: Math.max(0, performance.now() - clock),
      status,
      caseId: snapshot.caseId,
      condition: snapshot.condition,
      inputTokens,
      outputTokens,
      usageCoverage:
        reports === 0
          ? "unknown"
          : retries !== null && reports === retries + 1
            ? "complete"
            : "partial",
      retries,
    });
  };
  finish.usage = enabled
    ? (usage: { inputTokens: number; outputTokens: number }) => {
        reports++;
        inputTokens = (inputTokens ?? 0) + usage.inputTokens;
        outputTokens = (outputTokens ?? 0) + usage.outputTokens;
      }
    : undefined;
  return finish;
}
function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const safe = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportProbeRecords(scope: string, format: "json" | "csv"): string {
  const snapshot = readProbeScope(scope);
  const coverage =
    "Current window only; UI spans are client-observed. Runtime live telemetry is desktop-continuous only. Unknown usage is null. No replay backfill. Refresh clears records.";
  const metadata = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    durationUnit: "ms",
    tokenUnit: "provider tokens",
    coverage,
    droppedRecords: snapshot.dropped,
  };
  if (format === "json") return JSON.stringify({ ...metadata, records: snapshot.records }, null, 2);
  const columns: (keyof ProbeRecord)[] = [
    "id",
    "track",
    "caseId",
    "condition",
    "operation",
    "source",
    "startedAt",
    "durationMs",
    "status",
    "model",
    "inputTokens",
    "outputTokens",
    "retries",
    "usageCoverage",
  ];
  const headers = [
    "schemaVersion",
    "durationUnit",
    "tokenUnit",
    "coverage",
    "droppedRecords",
    ...columns,
  ];
  return (
    "\ufeff" +
    [
      headers.map(csvCell).join(","),
      ...snapshot.records.map((record) =>
        [
          1,
          "ms",
          "provider tokens",
          coverage,
          snapshot.dropped,
          ...columns.map((column) => record[column]),
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n")
  );
}
