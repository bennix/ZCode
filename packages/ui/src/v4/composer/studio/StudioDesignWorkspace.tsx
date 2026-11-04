import type { StudioDesignVersion } from "@/store/studioDesignHistory.js";
import { StudioDesignPreviewToolbar } from "./StudioDesignPreviewToolbar.js";
import { StudioDesignFeedback } from "./StudioDesignFeedback.js";
import { GuidedSteps } from "../GuidedSteps.js";
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
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState(INITIAL);
  const [html, setHtml] = useState("");
  const [feedback, setFeedback] = useState("");
  const [asset, setAsset] = useState("");
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [versions, setVersions] = useState<StudioDesignVersion[]>([]);
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
    setStep(2);
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
    setStep(2);
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
          setStep(project.html ? 2 : 0);
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
          setStep(0);
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
      <GuidedSteps
        steps={["chat.guide.purpose", "chat.guide.visual", "chat.guide.preview"]}
        current={step}
        onChange={setStep}
        disabled={busy}
        canAdvance={(step === 0 && Boolean(brief.goal.trim())) || (step === 1 && Boolean(html))}
      />
      <div hidden={!coDesign}>
        <details open={step === 2}>
          <summary className="cursor-pointer text-ui-caption">
            {intl.formatMessage({ id: "chat.studio.codesign.title" })}
          </summary>
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
        </details>
      </div>
      <div hidden={step !== 1 || (!sourceImageUrl && !asset)}>
        <StudioDesignAssetPicker
          sourceImageUrl={sourceImageUrl}
          asset={asset}
          disabled={busy}
          loading={loadingAsset}
          onLoadingChange={setLoadingAsset}
          onChange={setAsset}
          onError={setError}
        />
      </div>
      <div hidden={step === 2}>
        <StudioDesignBriefForm
          brief={brief}
          setBrief={setBrief}
          busy={busy}
          stage={step === 0 ? "purpose" : "visual"}
        />
      </div>
      {step === 1 ? (
        <p className="my-2 text-ui-caption text-foreground-subtle">
          {brief.goal} · {brief.audience}
          <br />
          {intl.formatMessage({ id: "chat.guide.designReview" })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          hidden={step !== 1}
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
      <div hidden={step !== 2}>
        {html ? (
          <>
            <StudioDesignPreviewToolbar
              html={html}
              versions={versions.map((version) => version.html)}
              mobile={mobile}
              busy={busy}
              onMobile={setMobile}
              onVersion={(index) => {
                const version = versions[index];
                if (!version) return;
                setHtml(version.html);
                setBrief(version.brief);
                setCommittedBrief(version.brief);
                codesign.reset(version.codesign ?? EMPTY_CODESIGN);
              }}
            />
            <StudioDesignPreview
              html={html}
              mobile={mobile}
              title={t("preview")}
              selecting={coDesign && codesign.selecting}
              onSelection={codesign.setSelection}
            />
            <StudioDesignFeedback
              feedback={feedback}
              busy={busy}
              canRevise={Boolean(apiKey)}
              canSave={Boolean(platform.saveFile)}
              onFeedback={setFeedback}
              onRevise={() => void execute(true)}
              onSave={(kind) => void save(kind)}
            />
          </>
        ) : (
          <p className="rounded-xl border border-border bg-surface p-3 text-ui-caption text-foreground-subtle">
            {t("empty")}
          </p>
        )}
      </div>
      <p className="text-ui-xs text-foreground-subtle">{t("draftNotice")}</p>
    </div>
  );
}
