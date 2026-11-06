import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  exportProbeRecords,
  useResearchProbeStore,
  type ProbeTrack,
} from "@/store/researchProbeStore.js";

export function ResearchProbePanel({ scope }: { scope: string }) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.probes.${key}` });
  const platform = usePlatform();
  const data = useResearchProbeStore((state) => state.scopes[scope]);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<"count" | "durationMs" | "tokens">("count");
  const chart = useMemo(() => {
    const groups = new Map<string, { name: string; sum: number; known: number }>();
    for (const record of data?.records ?? []) {
      const name = `${record.track} / ${record.caseId} / ${record.condition} / ${record.operation} / ${record.model ?? "—"} / ${record.status}`;
      const group = groups.get(name) ?? { name, sum: 0, known: 0 };
      const value =
        metric === "count"
          ? 1
          : metric === "durationMs"
            ? record.durationMs
            : record.inputTokens === null || record.outputTokens === null
              ? null
              : record.inputTokens + record.outputTokens;
      if (value !== null) {
        group.sum += value;
        group.known++;
      }
      groups.set(name, group);
    }
    return [...groups.values()].map((group) => ({
      name: group.name,
      value: group.known ? group.sum : null,
    }));
  }, [data?.records, metric]);
  const save = async (format: "json" | "csv") => {
    setError("");
    try {
      if (!platform.saveFile) throw new Error(t("exportFailed"));
      const bytes = new TextEncoder().encode(exportProbeRecords(scope, format));
      const result = await platform.saveFile({
        data: bytes.buffer,
        suggestedName: `research-probes.${format}`,
      });
      if (!result.canceled && !result.success) throw new Error(t("exportFailed"));
    } catch {
      setError(t("exportFailed"));
    }
  };
  return (
    <details
      className="mb-3 rounded-xl border border-border bg-card p-3 text-ui-caption"
      data-testid="research-probes"
    >
      <summary className="cursor-pointer font-medium">
        {t("title")} · {data?.records.length ?? 0}
      </summary>
      <p className="my-2 text-foreground-subtle">{t("coverage")}</p>
      <div className="flex flex-wrap gap-3">
        {(["guided-task", "local-edit"] as ProbeTrack[]).map((track) => (
          <label key={track} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data?.enabled[track] ?? false}
              onChange={(event) =>
                useResearchProbeStore.getState().toggle(scope, track, event.target.checked)
              }
            />
            {t(track)}
          </label>
        ))}
      </div>
      <div className="my-2 grid gap-2 sm:grid-cols-2">
        {(["caseId", "condition"] as const).map((field) => (
          <label key={field} className="flex min-w-0 flex-col gap-1">
            {t(field)}
            <input
              className="min-w-0 rounded-lg border border-input-border bg-input px-2 py-1 text-ui-base"
              maxLength={64}
              value={data?.[field] ?? (field === "caseId" ? "pilot" : "default")}
              onChange={(event) =>
                useResearchProbeStore.getState().configure(scope, { [field]: event.target.value })
              }
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void save("json")}>
          {t("json")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void save("csv")}>
          {t("csv")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => useResearchProbeStore.getState().clear(scope)}
        >
          {t("clear")}
        </Button>
        <label>
          {t("metric")}{" "}
          <select
            className="rounded-lg border border-input-border bg-input px-2 py-1 text-ui-base"
            value={metric}
            onChange={(event) => setMetric(event.target.value as typeof metric)}
          >
            <option value="count">{t("count")}</option>
            <option value="durationMs">{t("duration")}</option>
            <option value="tokens">{t("tokens")}</option>
          </select>
        </label>
      </div>
      {data?.dropped ? (
        <p role="status">
          {t("dropped")} {data.dropped}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {chart.length ? (
        <>
          <div className="mt-3 h-56 w-full min-w-0" aria-label={t("chart")}>
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 300, height: 224 }}
            >
              <BarChart data={chart} accessibilityLayer>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="var(--color-brand)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-left text-ui-caption">
            <caption>{t("chart")}</caption>
            <thead>
              <tr>
                <th>{t("group")}</th>
                <th>{t(metric === "durationMs" ? "duration" : metric)}</th>
              </tr>
            </thead>
            <tbody>
              {chart.map((row) => (
                <tr key={row.name}>
                  <td className="break-all">{row.name}</td>
                  <td>{row.value === null ? t("unknown") : Math.round(row.value * 100) / 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mt-2 text-foreground-subtle">{t("empty")}</p>
      )}
    </details>
  );
}
