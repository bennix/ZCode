import { z } from "zod";
import { modelSelectionSchema } from "./model-selection.js";

/** 文本与附件发送共用执行约束，凭据只属于单次执行，不进入 Session 配置。 */
export const modelExecutionSchema = z
  .object({
    memoryExtraction: z.literal("skip").optional(),
    selectionScope: z.literal("execution"),
    /** 用于本次已准入任务的独立调度判断，不改变会话默认选择。 */
    dispatcher: modelSelectionSchema.optional(),
    requestAuth: z
      .object({
        apiKey: z.string().min(1).optional(),
        headers: z.record(z.string().min(1), z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    subagents: z
      .object({
        foregroundModel: z.literal("submission"),
        background: z.literal("deny"),
      })
      .strict()
      .optional(),
  })
  .strict();
