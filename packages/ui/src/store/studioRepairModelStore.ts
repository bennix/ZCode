import { ZENMUX_SYSTEM_ONE_MODEL_ID } from "@zcode/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioEvaluatorApi = "system-one" | "chat";

interface StudioRepairModelState {
  modelId: string;
  evaluatorModelId: string;
  evaluatorApi: StudioEvaluatorApi;
  setEvaluatorModelId: (modelId: string) => void;
  setEvaluatorApi: (api: StudioEvaluatorApi) => void;
  setModelId: (modelId: string) => void;
}

const PREVIOUS_SYSTEM_ONE_MODEL_ID = "typesafe/jev-1.13";

function migrateEvaluatorModelId(modelId: unknown): string {
  if (typeof modelId !== "string") return ZENMUX_SYSTEM_ONE_MODEL_ID;
  // 只迁移曾经写死的默认值。用户后来填的其他模型，包括留空关闭，都保持原样。
  return modelId === PREVIOUS_SYSTEM_ONE_MODEL_ID ? ZENMUX_SYSTEM_ONE_MODEL_ID : modelId;
}

function migrateEvaluatorApi(api: unknown): StudioEvaluatorApi {
  return api === "chat" ? "chat" : "system-one";
}

/** 修复模型独立于成稿模型；任务开始时读取，避免中途切换模型和推理参数。 */
export const useStudioRepairModelStore = create<StudioRepairModelState>()(
  persist(
    (set) => ({
      modelId: "",
      evaluatorModelId: ZENMUX_SYSTEM_ONE_MODEL_ID,
      evaluatorApi: "system-one",
      setModelId: (modelId) => set({ modelId }),
      setEvaluatorModelId: (evaluatorModelId) => set({ evaluatorModelId }),
      setEvaluatorApi: (evaluatorApi) => set({ evaluatorApi }),
    }),
    {
      name: "zencode.studio.repair-model",
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<StudioRepairModelState>;
        return {
          modelId: typeof state.modelId === "string" ? state.modelId : "",
          evaluatorModelId: migrateEvaluatorModelId(state.evaluatorModelId),
          evaluatorApi: migrateEvaluatorApi(state.evaluatorApi),
        };
      },
      partialize: ({ modelId, evaluatorModelId, evaluatorApi }) => ({
        modelId,
        evaluatorModelId,
        evaluatorApi,
      }),
    },
  ),
);

export function resolveStudioRepairModel(writer: string): string {
  return useStudioRepairModelStore.getState().modelId.trim() || writer;
}
