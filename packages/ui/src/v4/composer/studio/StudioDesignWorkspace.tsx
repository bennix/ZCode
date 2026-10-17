import { StudioDesignPreview } from "./StudioDesignPreview.js";
import { StudioDesignAssetPicker } from "./StudioDesignAssetPicker.js";
import { useStudioDesignProjects } from "@/hooks/useStudioDesignProjects.js";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  deriveDesignSystem,
  generateDesignPrototype,
  isolateDesignDocument,
  type StudioDesignBrief,
} from "./studioDesign.js";

const INITIAL: StudioDesignBrief = {
  goal: "",
  audience: "",
  platform: "responsive-web",
  palette: "light-neutral",
  typography: "system-ui",
  layout: "adaptive-grid",
  mood: "restrained",
  density: "comfortable",
  constraints: "",
};
const choices = {
  platform: ["responsive-web", "mobile-app", "desktop-app"],
  palette: ["light-neutral", "dark-neutral", "warm-editorial", "brand-blue"],
  typography: ["system-ui", "serif-editorial", "monospace"],
  layout: ["adaptive-grid", "sidebar-workspace", "single-column"],
  mood: ["restrained", "editorial", "playful"],
  density: ["compact", "comfortable", "spacious"],
} as const;
export function StudioDesignWorkspace({
  apiKey,
  model,
  reasoning,
  onBusyChange,
  sourceImageUrl,
}: {
  apiKey: string;
  model: string;
  reasoning?: Record<string, unknown>;
  onBusyChange: (busy: boolean) => void;
  sourceImageUrl?: string | null;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const projects = useStudioDesignProjects();
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID());
  const [saved, setSaved] = useState(false);
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.design.${key}` });
  const [brief, setBrief] = useState(INITIAL);
  const [html, setHtml] = useState("");
  const [feedback, setFeedback] = useState("");
  const [asset, setAsset] = useState("");
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [versions, setVersions] = useState<{ html: string; brief: StudioDesignBrief }[]>([]);
  const [committedBrief, setCommittedBrief] = useState(INITIAL);
  const run = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      run.current?.abort();
    },
    [],
  );
  const execute = async (revise: boolean) => {
    if (busy || loadingAsset || !apiKey || !brief.goal.trim() || (revise && !feedback.trim()))
      return;
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setOutput("");
    try {
      const next = await generateDesignPrototype({
        apiKey,
        model,
        reasoning,
        asset,
        brief,
        previous: revise ? html : "",
        feedback: revise ? feedback : "",
        signal: controller.signal,
        onOutput: (text) => {
          if (run.current === controller && !controller.signal.aborted) setOutput(text);
        },
      });
      if (run.current !== controller || controller.signal.aborted) return;
      setVersions((current) => [...current, { html: next, brief: { ...brief } }].slice(-10));
      setCommittedBrief({ ...brief });
      setHtml(next);
      setSaved(false);
      setFeedback("");
    } catch (failure) {
      if (run.current === controller && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (run.current === controller) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  const save = async (kind: "html" | "system") => {
    if (!platform.saveFile) return;
    try {
      const result = await platform.saveFile({
        suggestedName: kind === "html" ? "zencode-prototype.html" : "DESIGN.md",
        data: new TextEncoder().encode(
          kind === "html" ? isolateDesignDocument(html) : deriveDesignSystem(committedBrief),
        ).buffer,
      });
      if (!result.success && result.error) setError(result.error);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return (
    <div
      className="space-y-3"
      data-testid="studio-design-workspace"
      onInput={() => setSaved(false)}
    >
      <div>
        <h3 className="text-ui-base font-medium">{t("title")}</h3>
        <p className="text-ui-caption text-foreground-subtle">{t("guide")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("projects")}
          value={projects.records.some((record) => record.id === projectId) ? projectId : ""}
          disabled={busy || projects.saving}
          className="h-8 max-w-full rounded-lg border border-input-border bg-input px-2 text-ui-caption"
          onChange={(event) => {
            const project = projects.records.find((record) => record.id === event.target.value);
            if (!project) return;
            setProjectId(project.id);
            setBrief(project.brief);
            setCommittedBrief(
              project.versions.findLast((version) => version.html === project.html)?.brief ??
                project.brief,
            );
            setHtml(project.html);
            setVersions(project.versions);
            setAsset(project.asset);
            setFeedback("");
            setOutput("");
            setSaved(true);
            setError("");
          }}
        >
          <option value="" disabled>
            {t("projects")}
          </option>
          {projects.records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.title}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={busy || projects.saving}
          onClick={() => {
            setProjectId(crypto.randomUUID());
            setBrief(INITIAL);
            setCommittedBrief(INITIAL);
            setHtml("");
            setVersions([]);
            setAsset("");
            setFeedback("");
            setOutput("");
            setSaved(false);
            setError("");
          }}
        >
          {t("new")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || projects.saving || !html}
          onClick={async () => {
            setSaved(false);
            const success = await projects.save({
              id: projectId,
              title: brief.goal.trim().slice(0, 120) || "Design",
              brief: { ...brief },
              html,
              versions,
              asset,
              updatedAt: Date.now(),
            });
            if (success) setSaved(true);
          }}
        >
          {t("save")}
        </Button>
        <Button
          variant="ghost"
          disabled={
            busy || projects.saving || !projects.records.some((record) => record.id === projectId)
          }
          onClick={async () => {
            if (await projects.remove(projectId)) {
              setProjectId(crypto.randomUUID());
              setSaved(false);
            }
          }}
        >
          {t("delete")}
        </Button>
        {saved ? (
          <span role="status" className="text-ui-xs text-foreground-subtle">
            {t("saved")}
          </span>
        ) : null}
      </div>
      {projects.error ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {t("storageError")}
        </p>
      ) : null}
      <StudioDesignAssetPicker
        sourceImageUrl={sourceImageUrl}
        asset={asset}
        disabled={busy}
        loading={loadingAsset}
        onLoadingChange={setLoadingAsset}
        onChange={setAsset}
        onError={setError}
      />
      <fieldset disabled={busy} className="min-w-0 space-y-2">
        <legend className="mb-2 text-ui-caption font-medium">{t("brief")}</legend>
        {(["goal", "audience"] as const).map((key) => (
          <label key={key} className="block text-ui-caption">
            {t(key)}
            <textarea
              aria-label={t(key)}
              value={brief[key]}
              onChange={(event) =>
                setBrief((current) => ({ ...current, [key]: event.target.value }))
              }
              className="mt-1 min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
            />
          </label>
        ))}
        <details>
          <summary className="cursor-pointer text-ui-caption">{t("system")}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(choices).map(([key, values]) => (
              <label key={key} className="min-w-0 text-ui-caption">
                {t(key)}
                <select
                  aria-label={t(key)}
                  value={brief[key as keyof StudioDesignBrief]}
                  onChange={(event) =>
                    setBrief((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="mt-1 h-8 w-full rounded-lg border border-input-border bg-input px-2"
                >
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {t(`option.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="mt-2 block text-ui-caption">
            {t("constraints")}
            <textarea
              aria-label={t("constraints")}
              value={brief.constraints}
              onChange={(event) =>
                setBrief((current) => ({ ...current, constraints: event.target.value }))
              }
              className="mt-1 min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
            />
          </label>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-ui-caption">
            {deriveDesignSystem(brief)}
          </pre>
        </details>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy || loadingAsset || !apiKey || !brief.goal.trim()}
          onClick={() => void execute(false)}
        >
          {t("generate")}
        </Button>
        <span className="break-all text-ui-xs text-foreground-subtle">{model}</span>
        {busy ? (
          <Button
            variant="ghost"
            onClick={() => {
              run.current?.abort();
              setBusy(false);
              onBusyChange(false);
            }}
          >
            {intl.formatMessage({ id: "chat.studio.stop" })}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {error}
        </p>
      ) : null}
      {output ? (
        <details open={busy}>
          <summary className="text-ui-caption">{t("output")}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-ui-caption">{output}</pre>
        </details>
      ) : null}
      {html ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={mobile ? "ghost" : "secondary"} onClick={() => setMobile(false)}>
              {t("desktop")}
            </Button>
            <Button variant={mobile ? "secondary" : "ghost"} onClick={() => setMobile(true)}>
              {t("mobile")}
            </Button>
            <select
              aria-label={t("versions")}
              value={String(versions.findLastIndex((version) => version.html === html))}
              disabled={busy}
              className="h-8 rounded-lg border border-input-border bg-input text-ui-caption"
              onChange={(event) => {
                const version = versions[Number(event.target.value)];
                if (version) {
                  setHtml(version.html);
                  setBrief(version.brief);
                  setCommittedBrief(version.brief);
                }
              }}
            >
              {versions.map((_, index) => (
                <option key={index} value={index}>
                  {t("version")} {index + 1}
                </option>
              ))}
            </select>
          </div>
          <StudioDesignPreview html={html} mobile={mobile} title={t("preview")} />
          <label className="block text-ui-caption">
            {t("feedback")}
            <textarea
              aria-label={t("feedback")}
              value={feedback}
              disabled={busy}
              onChange={(event) => setFeedback(event.target.value)}
              className="mt-1 min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !apiKey || !feedback.trim()}
              onClick={() => void execute(true)}
            >
              {t("revise")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !platform.saveFile}
              onClick={() => void save("html")}
            >
              {t("exportHtml")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !platform.saveFile}
              onClick={() => void save("system")}
            >
              {t("exportSystem")}
            </Button>
          </div>
          {!platform.saveFile ? <p className="text-ui-caption">{t("noSave")}</p> : null}
        </>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-3 text-ui-caption text-foreground-subtle">
          {t("empty")}
        </p>
      )}
      <p className="text-ui-xs text-foreground-subtle">{t("draftNotice")}</p>
    </div>
  );
}
