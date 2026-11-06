import { usePlatform } from "@/hooks/usePlatform.js";
import { useState } from "react";
import {
  WORKCODER_MODELS,
  type ModelSelectionView,
  type WorkCoderRole,
  type WorkCoderModels,
  type WorkCoderTarget,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useWorkCoder } from "@/hooks/useWorkCoder.js";
import { createComposerSubmissionConfig } from "../composerSubmissionConfig.js";
import { GuidedSteps } from "../GuidedSteps.js";
import { resolveEffort, supportedEfforts } from "../reasoningEffort.js";
import { thoughtLevelLabelId } from "@/chat-input-toolbar/thoughtLevelOptions.js";

export function WorkCoderWorkspace({
  modelSelectionView,
  onStarted,
  ...target
}: WorkCoderTarget & { modelSelectionView: ModelSelectionView | null; onStarted?: () => void }) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.workcoder.${key}` });
  const platform = usePlatform();
  const [directory, setDirectory] = useState(target.workspacePath);
  const [directoryError, setDirectoryError] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const actualTarget =
    target.workspaceIdentity?.trim() || target.remoteSessionId
      ? target
      : { workspacePath: directory.trim() };
  const roles: WorkCoderRole[] = ["main", "research", "advisor"];
  const [step, setStep] = useState(0);
  const [task, setTask] = useState("");
  const [selections, setSelections] = useState<Record<WorkCoderRole, string>>({
    ...WORKCODER_MODELS,
  });
  const [efforts, setEfforts] = useState<Partial<Record<WorkCoderRole, string>>>({});
  const effortLabel = (value: string) => {
    const id = thoughtLevelLabelId(value);
    return id ? intl.formatMessage({ id }) : value;
  };
  const choices =
    modelSelectionView?.providers.flatMap((provider) =>
      provider.models.map((model) => ({
        key: `${provider.providerId}\n${model.modelId}`,
        provider: provider.providerId,
        model: model.modelId,
        efforts: supportedEfforts(
          model.modelId,
          model.config.optionSpecs.reasoningLevel.values,
          model.config.optionSpecs.reasoningLevel.map,
        ),
      })),
    ) ?? [];
  const selectedChoices = Object.fromEntries(
    roles.map((role) => [
      role,
      choices.find((choice) => choice.key === selections[role]) ??
        choices.find((choice) => choice.model === selections[role]),
    ]),
  ) as Record<WorkCoderRole, (typeof choices)[number] | undefined>;
  const models = Object.fromEntries(
    roles.map((role) => {
      const selected = selectedChoices[role];
      return [
        role,
        selected
          ? {
              providerId: selected.provider,
              modelId: selected.model,
              // 原因：固定 low 会拒绝仅支持 none/high 的模型；按当前 provider 的实际能力解析。
              options: {
                reasoningLevel: resolveEffort(
                  efforts[role] ??
                    (role === "research" && /haiku/iu.test(selected.model) ? "none" : "low"),
                  selected.efforts,
                ),
              },
            }
          : null,
      ];
    }),
  );
  const valid = roles.every(
    (role) =>
      models[role] &&
      createComposerSubmissionConfig(
        { mode: "build", planEnabled: false, modelSelection: models[role] },
        modelSelectionView,
      ),
  );
  const ready = (role: WorkCoderRole) =>
    models[role] &&
    createComposerSubmissionConfig(
      { mode: "build", planEnabled: false, modelSelection: models[role] },
      modelSelectionView,
    );
  const canConfigureResearch =
    !models.research &&
    selections.research === WORKCODER_MODELS.research &&
    ready("main") &&
    ready("advisor");
  const launchModels: WorkCoderModels | null =
    models.main && models.advisor
      ? {
          main: models.main,
          advisor: models.advisor,
          research: models.research ?? {
            providerId: models.main.providerId,
            modelId: WORKCODER_MODELS.research,
            options: { reasoningLevel: "none" },
          },
        }
      : null;
  const { start, busy, retry, error } = useWorkCoder(actualTarget, onStarted);
  const selectDirectory = async () => {
    setDirectoryError("");
    try {
      const selected = await platform.selectDirectory();
      if (selected) setDirectory(selected);
    } catch {
      setDirectoryError(t("directoryError"));
    }
  };
  return (
    <section
      className="mb-3 rounded-2xl border border-border bg-card p-3 text-ui-base"
      data-testid="workcoder-workspace"
    >
      <h2 className="font-medium">WorkCoder</h2>
      <p className="my-2 text-ui-caption text-foreground-subtle">{t("description")}</p>
      <GuidedSteps
        probeScope={target.workspaceIdentity?.trim() || target.workspacePath}
        steps={["chat.workcoder.roles", "chat.workcoder.task", "chat.workcoder.confirm"]}
        current={step}
        onChange={setStep}
        disabled={busy || retry}
        canAdvance={step === 0 || Boolean(task.trim())}
      />
      {step === 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {roles.map((role) => {
            const noReasoning =
              (selectedChoices[role]?.efforts.length === 1 &&
                selectedChoices[role]?.efforts[0] === "none") ||
              (role === "research" &&
                !models[role] &&
                selections[role] === WORKCODER_MODELS.research);
            return (
              <div
                data-testid={`workcoder-role-${role}`}
                key={role}
                className="flex min-w-0 flex-col gap-1 text-ui-caption"
              >
                <span className="font-medium">{t(role)}</span>
                <span className="text-foreground-subtle">{t(`${role}Help`)}</span>
                <select
                  aria-label={t(role)}
                  className="w-full min-w-0 rounded-lg border border-input-border bg-input px-2 py-2 text-ui-base"
                  value={
                    choices.some((choice) => choice.key === selections[role])
                      ? selections[role]
                      : (choices.find((choice) => choice.model === selections[role])?.key ??
                        selections[role])
                  }
                  onChange={(event) => {
                    setSelections((current) => ({ ...current, [role]: event.target.value }));
                    setEfforts((current) => ({ ...current, [role]: undefined }));
                  }}
                >
                  {!models[role] ? (
                    <option value={selections[role]}>{selections[role]}</option>
                  ) : null}
                  {choices.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {choice.model} · {choice.provider}
                    </option>
                  ))}
                </select>
                {noReasoning ? (
                  <p>{t("noReasoning")}</p>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span>{t("effort")}</span>
                    <select
                      aria-label={`${t(role)} ${t("effort")}`}
                      className="w-full min-w-0 rounded-lg border border-input-border bg-input px-2 py-2 text-ui-base"
                      disabled={!selectedChoices[role]?.efforts.length}
                      value={models[role]?.options.reasoningLevel ?? ""}
                      onChange={(event) =>
                        setEfforts((current) => ({ ...current, [role]: event.target.value }))
                      }
                    >
                      {!selectedChoices[role]?.efforts.length ? (
                        <option value="">{t("chooseModel")}</option>
                      ) : null}
                      {selectedChoices[role]?.efforts.map((value) => (
                        <option key={value} value={value}>
                          {effortLabel(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {!valid ? (
        <p role="status" className="my-2 text-ui-caption text-warning">
          {t("unavailable")}
        </p>
      ) : null}
      {step === 1 ? (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            {t("directory")}
            <input
              aria-label={t("directory")}
              className="w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
              value={directory}
              readOnly={
                Boolean(target.workspaceIdentity?.trim() || target.remoteSessionId) || busy || retry
              }
              onChange={(event) => setDirectory(event.target.value)}
            />
          </label>
          {!target.workspaceIdentity?.trim() &&
          !target.remoteSessionId &&
          platform.isDesktopRuntime ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || retry}
              onClick={() => void selectDirectory()}
            >
              {t("selectDirectory")}
            </Button>
          ) : null}
          {target.workspaceIdentity?.trim() || target.remoteSessionId ? (
            <p className="text-ui-caption text-foreground-subtle">{t("remoteDirectory")}</p>
          ) : null}
          <label className="flex items-center gap-2 text-ui-base">
            <input
              type="checkbox"
              checked={autoApprove}
              disabled={busy || retry}
              onChange={(event) => setAutoApprove(event.target.checked)}
            />
            {t("autoApprove")}
          </label>
          <p className="text-ui-caption text-foreground-subtle">{t("autoApproveHelp")}</p>
          {directoryError ? <p role="alert">{directoryError}</p> : null}
          <label className="flex flex-col gap-2">
            {t("task")}
            <textarea
              className="min-h-28 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder={t("placeholder")}
            />
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="space-y-2">
          <p className="text-ui-caption text-foreground-subtle">{t("checkpoints")}</p>
          <p className="text-ui-caption text-foreground-subtle">{t("instructions")}</p>
          <ul className="space-y-1 text-ui-caption">
            {roles.map((role) => (
              <li key={role} className="break-all">
                {t(role)} · {models[role]?.modelId ?? selections[role]} ·{" "}
                {models[role]
                  ? effortLabel(models[role].options.reasoningLevel)
                  : role === "research" && canConfigureResearch
                    ? t("noReasoningSetup")
                    : t("chooseModel")}
              </li>
            ))}
          </ul>
          <p className="text-ui-caption">
            {t("autoApprove")} · {t(autoApprove ? "on" : "off")}
          </p>
          <p className="break-all text-ui-caption">
            {t("directory")} · {actualTarget.workspacePath}
          </p>
          {canConfigureResearch ? (
            <p className="text-ui-caption text-foreground-subtle">{t("researchSetup")}</p>
          ) : null}
          <p className="whitespace-pre-wrap break-words">{task}</p>
          {!valid ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || retry}
              onClick={() => setStep(0)}
            >
              {t("adjustModels")}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={
              busy ||
              (!retry &&
                (!(valid || canConfigureResearch) || !task.trim() || !actualTarget.workspacePath))
            }
            onClick={() =>
              void start(launchModels, task, {
                configureResearch: Boolean(canConfigureResearch),
                autoApprove,
              })
            }
          >
            {busy
              ? t("starting")
              : retry
                ? t("retry")
                : canConfigureResearch
                  ? t("configureStart")
                  : t("start")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 break-words text-ui-caption text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
