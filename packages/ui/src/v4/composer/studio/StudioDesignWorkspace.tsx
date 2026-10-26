import { StudioDesignBriefForm, INITIAL } from "./StudioDesignBriefForm.js";
import {
  EMPTY_CODESIGN,
  parseCoDesignDocument,
  type CoDesignState,
  type CoDesignDocument,
} from "@zcode/shared";
import { useStudioCoDesign } from "./useStudioCoDesign.js";
import { StudioCoDesignControls } from "./StudioCoDesignControls.js";
import { StudioDesignProjectBar } from "./StudioDesignProjectBar.js";
import {
  prepareCoDesignHtml,
  readCoDesignMetadata,
  syncCoDesignMetadata,
} from "./coDesignDocument.js";
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

export function StudioDesignWorkspace({
  apiKey,
  model,
  reasoning,
  onBusyChange,
  sourceImageUrl,
  coDesign = false,
}: {
  apiKey: string;
  model: string;
  reasoning?: Record<string, unknown>;
  onBusyChange: (busy: boolean) => void;
  sourceImageUrl?: string | null;
  coDesign?: boolean;
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
  const [versions, setVersions] = useState<
    { html: string; brief: StudioDesignBrief; codesign?: CoDesignState }[]
  >([]);
  const [committedBrief, setCommittedBrief] = useState(INITIAL);
  const run = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      run.current?.abort();
    },
    [],
  );
  const commitDesign = (next: string, metadata: CoDesignState, currentBrief = brief) => {
    setVersions((current) =>
      [...current, { html: next, brief: { ...currentBrief }, codesign: metadata }].slice(-10),
    );
    setCommittedBrief({ ...currentBrief });
    setHtml(next);
    setSaved(false);
  };
  const codesign = useStudioCoDesign({
    html,
    apiKey,
    model,
    busy,
    reasoning,
    run,
    onBusy: (value) => {
      setBusy(value);
      onBusyChange(value);
    },
    onError: setError,
    onOutput: setOutput,
    onCommit: commitDesign,
  });
  const importDesign = (document: CoDesignDocument) => {
    if (busy || projects.saving) return;
    const next = syncCoDesignMetadata(prepareCoDesignHtml(document.html), document.codesign);
    setProjectId(crypto.randomUUID());
    setBrief(document.brief);
    setVersions([]);
    setAsset("");
    setFeedback("");
    codesign.reset(document.codesign);
    commitDesign(next, document.codesign, document.brief);
    setOutput("");
    setError("");
  };
  const exportCoDesign = async () => {
    if (!platform.saveFile) return;
    try {
      const document = parseCoDesignDocument({
        version: 1,
        brief,
        html,
        codesign: codesign.metadata,
      });
      const result = await platform.saveFile({
        suggestedName: "zencode-design.zencode-design.json",
        data: new TextEncoder().encode(JSON.stringify(document, null, 2)).buffer,
      });
      if (!result.success && result.error) setError(result.error);
    } catch (failure) {
      setError(String(failure));
    }
  };
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
        codesign: coDesign,
        brief: coDesign
          ? {
              ...brief,
              constraints: `${brief.constraints}\nArtifact kind: ${codesign.metadata.kind}`,
            }
          : brief,
        previous: revise ? html : "",
        feedback: revise ? feedback : "",
        signal: controller.signal,
        onOutput: (text) => {
          if (run.current === controller && !controller.signal.aborted) setOutput(text);
        },
      });
      if (run.current !== controller || controller.signal.aborted) return;
      if (coDesign) {
        const metadata = readCoDesignMetadata(next, {
          ...codesign.metadata,
          images: [],
          comments: [],
        });
        const prepared = syncCoDesignMetadata(prepareCoDesignHtml(next), metadata);
        codesign.reset(metadata);
        commitDesign(prepared, metadata);
      } else commitDesign(next, codesign.metadata);
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
      <p className="text-ui-caption text-foreground-subtle">{t("guide")}</p>
      <StudioDesignProjectBar
        records={projects.records}
        projectId={projectId}
        disabled={busy || projects.saving}
        hasHtml={Boolean(html)}
        saved={saved}
        error={projects.error}
        onOpen={(project) => {
          setProjectId(project.id);
          setBrief(project.brief);
          setCommittedBrief(
            project.versions.findLast((version) => version.html === project.html)?.brief ??
              project.brief,
          );
          setHtml(project.html);
          setVersions(project.versions);
          setAsset(project.asset);
          codesign.reset(project.codesign ?? EMPTY_CODESIGN);
          setFeedback("");
          setOutput("");
          setSaved(true);
          setError("");
        }}
        onNew={() => {
          setProjectId(crypto.randomUUID());
          setBrief(INITIAL);
          setCommittedBrief(INITIAL);
          setHtml("");
          setVersions([]);
          setAsset("");
          codesign.reset();
          setFeedback("");
          setOutput("");
          setSaved(false);
          setError("");
        }}
        onSave={async () => {
          setSaved(false);
          if (
            await projects.save({
              id: projectId,
              title: brief.goal.trim().slice(0, 120) || "Design",
              brief: { ...brief },
              html,
              versions,
              asset,
              codesign: codesign.metadata,
              updatedAt: Date.now(),
            })
          )
            setSaved(true);
        }}
        onDelete={async () => {
          if (await projects.remove(projectId)) {
            setProjectId(crypto.randomUUID());
            setSaved(false);
          }
        }}
      />
      {coDesign ? (
        <StudioCoDesignControls
          revision={html}
          canExport={Boolean(platform.saveFile)}
          value={codesign.metadata}
          disabled={busy || projects.saving}
          hasHtml={Boolean(html)}
          selecting={codesign.selecting}
          selection={codesign.selection}
          note={codesign.note}
          progress={codesign.progress}
          onChange={codesign.change}
          onImport={importDesign}
          onExport={() => void exportCoDesign()}
          onImages={() => void codesign.generateImages()}
          onSelecting={codesign.toggleSelection}
          onNote={codesign.setNote}
          onEdit={() => void codesign.applyComment()}
          onError={setError}
        />
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
      <StudioDesignBriefForm brief={brief} setBrief={setBrief} busy={busy} />
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
                  codesign.reset(version.codesign ?? EMPTY_CODESIGN);
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
          <StudioDesignPreview
            html={html}
            mobile={mobile}
            title={t("preview")}
            selecting={coDesign && codesign.selecting}
            onSelection={codesign.setSelection}
          />
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
