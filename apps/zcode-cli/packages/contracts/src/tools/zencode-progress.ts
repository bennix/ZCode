import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const ZENCODE_MARK_PROGRESS_TOOL_NAME = "zencode_mark_progress";

export const ZencodeMarkProgressInputSchema = z
  .object({
    stage: z.enum(["analysis", "editing", "verification", "complete"]),
    summary: z.string().trim().min(1).max(240),
  })
  .strict();

export const ZencodeMarkProgressOutputSchema = ZencodeMarkProgressInputSchema;
export const ZencodeMarkProgressInputJsonSchema = toToolJsonSchema(ZencodeMarkProgressInputSchema);
export const ZencodeMarkProgressOutputJsonSchema = toToolJsonSchema(ZencodeMarkProgressOutputSchema);
export type ZencodeMarkProgressInput = z.infer<typeof ZencodeMarkProgressInputSchema>;
