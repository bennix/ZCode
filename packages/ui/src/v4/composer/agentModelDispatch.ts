import type { AppSettings, ModelSelection } from "@zcode/shared";
import type { CommandPayloadMap } from "@zcode/shared/zcode-protocol-v4";
import type { ModelSelectionView } from "@zcode/services";

/** 设置只表达用户意图；提交前用目标 Environment 的实时模型目录收窄候选。 */
export function dispatchExecutionForSubmission(input: {
  settings: Pick<AppSettings, "agentModelDispatchEnabled" | "agentModelDispatcher"> | null;
  view: Pick<ModelSelectionView, "providers"> | null;
  routingMode: "startNow" | "enqueue" | "guide" | "reject" | "choice" | null;
  manualModelOverride: boolean;
  submissionSelection: ModelSelection;
}): CommandPayloadMap["sendText"]["modelExecution"] | undefined {
  const dispatcher = input.settings?.agentModelDispatcher;
  if (
    input.settings?.agentModelDispatchEnabled !== true ||
    !dispatcher ||
    input.manualModelOverride ||
    (input.routingMode !== null && input.routingMode !== "startNow")
  ) {
    return undefined;
  }
  const registered = input.view?.providers
    .find((provider) => provider.providerId === dispatcher.providerId)
    ?.models.some((model) => model.modelId === dispatcher.modelId);
  const executorRegistered = input.view?.providers
    .find((provider) => provider.providerId === input.submissionSelection.providerId)
    ?.models.some((model) => model.modelId === input.submissionSelection.modelId);
  if (!registered || !executorRegistered) return undefined;
  // 本次执行约束沿用完整 Submission Selection；判断器在 Core admission 后从活目录选模型。
  // 这里不写入 Session Selection，也不在 Renderer 建第二条已接受输入队列。
  return {
    selectionScope: "execution",
    dispatcher: { ...dispatcher },
  };
}
