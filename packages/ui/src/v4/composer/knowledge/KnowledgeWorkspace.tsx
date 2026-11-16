import { engineeringStages } from "./engineeringStages.js";
import { useState } from "react";
import type { ModelSelectionView, ModelCostTier } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useKnowledgeWork } from "@/hooks/useKnowledgeWork.js";
import { useModelCostTiers } from "@/hooks/useModelCostTiers.js";
import { useOptionalTabStore } from "@/store/TabStoreProvider.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { GuidedSteps } from "../GuidedSteps.js";
import { knowledgeDomains } from "./catalog.js";

export function KnowledgeWorkspace({
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  modelSelectionView,
  onReady,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  modelSelectionView: ModelSelectionView | null;
  onReady: (text: string, selection?: { provider: string; model: string }) => void;
}) {
  const { intl, locale } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.knowledge.${key}` });
  const zh = locale.startsWith("zh");
  const [domainId, setDomainId] = useState<string>(knowledgeDomains[0].id);
  const [skillOverride, setSkillOverride] = useState("");
  const [step, setStep] = useState(0);
  const [task, setTask] = useState("");
  const [materials, setMaterials] = useState("");
  const [connectors, setConnectors] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [tier, setTier] = useState<ModelCostTier>("balanced");
  const [modelKey, setModelKey] = useState("");
  const { models: catalog, unavailable } = useModelCostTiers();
  const { prepare, busy, error } = useKnowledgeWork(
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
  );
  const openSettings = useOptionalTabStore((state) => state.openSettingsTab);
  const domain = knowledgeDomains.find((item) => item.id === domainId)!;
  const engineering = domain.id === "engineering";
  const stage = engineeringStages.find((item) => item.skill === skillOverride);
  const choices =
    modelSelectionView?.providers.flatMap((provider) =>
      provider.models.map((model) => ({
        key: `${provider.providerId}\n${model.modelId}`,
        provider: provider.providerId,
        model: model.modelId,
        metadata:
          provider.templateId === "zenmux"
            ? catalog.find((item) => item.id === model.modelId)
            : undefined,
      })),
    ) ?? [];
  const recommended = choices
    .filter(
      (item) =>
        item.metadata?.tier === tier &&
        (tier !== "deep" || (item.metadata.reasoning && item.metadata.context >= 128000)),
    )
    .sort(
      (a, b) =>
        a.metadata!.inputPrice +
        a.metadata!.outputPrice -
        (b.metadata!.inputPrice + b.metadata!.outputPrice),
    )[0];
  const selected =
    choices.find((item) => item.key === modelKey) ?? (modelKey ? undefined : recommended);
  return (
    <section
      data-testid="knowledge-workspace"
      className="rounded-2xl border border-border bg-card p-3 text-ui-base"
    >
      <h2 className="font-medium">{t("title")}</h2>
      <p className="my-2 text-ui-caption text-foreground-subtle">{t("intro")}</p>
      <GuidedSteps
        steps={[
          "chat.knowledge.domain",
          "chat.knowledge.task",
          "chat.knowledge.sources",
          "chat.knowledge.confirm",
        ]}
        current={step}
        onChange={setStep}
        disabled={busy}
        canAdvance={step !== 1 || Boolean(task.trim())}
      />
      {step === 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {knowledgeDomains.map((item) => (
            <Button
              type="button"
              variant={item.id === domainId ? "secondary" : "ghost"}
              aria-pressed={item.id === domainId}
              key={item.id}
              onClick={() => {
                setDomainId(item.id);
                setSkillOverride("");
                setConnectors([]);
              }}
            >
              {zh ? item.zh : item.en}
            </Button>
          ))}
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          {engineering && (
            <div data-testid="engineering-stages" className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {engineeringStages.map((item, index) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={stage?.id === item.id ? "secondary" : "ghost"}
                    aria-pressed={stage?.id === item.id}
                    onClick={() => setSkillOverride(item.skill)}
                  >
                    {index + 1}. {t(item.label)}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={!stage && (!skillOverride || skillOverride === "using-agent-skills")}
                onClick={() => setSkillOverride("using-agent-skills")}
              >
                {t("stageAuto")}
              </Button>
              <p className="text-ui-caption text-foreground-subtle">
                {stage ? t(stage.hint) : t("stageAutoHint")}
              </p>
            </div>
          )}
          <label className="block">
            {t("workflow")}
            <select
              aria-label={t("workflow")}
              value={skillOverride || domain.skill}
              onChange={(event) => setSkillOverride(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
            >
              {domain.skills.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {t("task")}
            <textarea
              aria-label={t("task")}
              className="mt-1 min-h-24 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
              value={task}
              onChange={(event) => setTask(event.target.value)}
            />
          </label>
          <label className="block">
            {t("materials")}
            <textarea
              aria-label={t("materials")}
              className="mt-1 min-h-16 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
              value={materials}
              onChange={(event) => setMaterials(event.target.value)}
            />
          </label>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <label className="flex gap-2">
            <input
              type="radio"
              name="knowledge-source"
              checked={!connected}
              onChange={() => setConnected(false)}
            />
            {t("local")}
          </label>
          <label className="flex gap-2">
            <input
              type="radio"
              name="knowledge-source"
              checked={connected}
              onChange={() => setConnected(true)}
            />
            {t("connected")}
          </label>
          {connected && (
            <>
              <p className="text-ui-caption text-foreground-subtle">{t("connectionHint")}</p>
              <div className="flex flex-wrap gap-3">
                {domain.connectors.map((name) => (
                  <label key={name} className="flex items-center gap-1 text-ui-caption">
                    <input
                      type="checkbox"
                      checked={connectors.includes(name)}
                      onChange={(event) =>
                        setConnectors((current) =>
                          event.target.checked
                            ? [...current, name]
                            : current.filter((item) => item !== name),
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPendingSettingsSectionIntent("mcp");
                  openSettings();
                }}
              >
                {t("configure")}
              </Button>
            </>
          )}
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <p>
            {zh ? domain.zh : domain.en} · {task}
          </p>
          <label className="block">
            {t("tier")}
            <select
              aria-label={t("tier")}
              value={tier}
              onChange={(event) => {
                setTier(event.target.value as ModelCostTier);
                setModelKey("");
              }}
              className="ml-2 rounded-lg border border-input-border bg-input p-2 text-ui-base"
            >
              {(["light", "balanced", "deep"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {t("model")}
            <select
              aria-label={t("model")}
              value={selected?.key ?? ""}
              onChange={(event) => setModelKey(event.target.value || "__current__")}
              className="mt-1 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
            >
              <option value="">{t("currentModel")}</option>
              {choices.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.model}
                  {item.metadata ? ` · ${t(item.metadata.tier)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="text-ui-caption text-foreground-subtle">
            {t("tierHint")}
            {unavailable ? ` ${t("catalogUnavailable")}` : ""}
          </p>
          <Button
            type="button"
            disabled={busy || !task.trim()}
            onClick={() =>
              void prepare(
                domain.id,
                skillOverride || domain.skill,
                `${engineering ? `${stage ? t(stage.hint) : t("stageAutoHint")}\n` : ""}${t("task")}: ${task.trim()}\n${t("materials")}: ${materials.trim()}\n${t("sources")}: ${connected ? `${t("connected")}: ${connectors.join(", ")}` : t("local")}\n${t("executionHint")}`,
                (text) => onReady(text, selected),
              )
            }
          >
            {busy ? t("preparing") : t("prepare")}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-ui-caption text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
