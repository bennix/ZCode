import { z } from "zod";

const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/u);
export const coDesignImageSchema = z.strictObject({
  id: identifier,
  prompt: z.string().trim().min(1).max(6000),
  purpose: z.enum(["hero", "product", "poster", "background", "illustration", "logo", "other"]),
  ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]),
  alt: z.string().max(300),
});
const tweakBase = {
  id: identifier,
  label: z.string().min(1).max(80),
  token: z.string().regex(/^--[a-z][a-z0-9-]{0,63}$/u),
};
export const coDesignTweakSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...tweakBase,
    kind: z.literal("color"),
    value: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  }),
  z.strictObject({
    ...tweakBase,
    kind: z.literal("number"),
    value: z.number().finite(),
    min: z.number().min(-1000).max(1000),
    max: z.number().min(-1000).max(1000),
    unit: z.enum(["px", "rem", "%", ""]),
  }),
]);
export const coDesignCommentSchema = z.strictObject({
  id: identifier,
  elementId: z.string().regex(/^zc-[0-9]+$/u),
  quote: z.string().max(500),
  note: z.string().trim().min(1).max(3000),
});
export const coDesignStateSchema = z.strictObject({
  kind: z.enum(["prototype", "poster", "report", "slides"]),
  images: z.array(coDesignImageSchema).max(8),
  tweaks: z.array(coDesignTweakSchema).max(24),
  comments: z.array(coDesignCommentSchema).max(32),
});
export const coDesignBriefSchema = z.strictObject({
  goal: z.string().max(12000),
  audience: z.string().max(6000),
  platform: z.string().max(100),
  palette: z.string().max(100),
  typography: z.string().max(100),
  layout: z.string().max(100),
  mood: z.string().max(100),
  density: z.string().max(100),
  constraints: z.string().max(12000),
});
export const coDesignDocumentSchema = z.strictObject({
  version: z.literal(1),
  brief: coDesignBriefSchema,
  html: z
    .string()
    .min(1)
    .max(32 * 1024 * 1024),
  codesign: coDesignStateSchema,
});
export type CoDesignState = z.infer<typeof coDesignStateSchema>;
export type CoDesignDocument = z.infer<typeof coDesignDocumentSchema>;
export type CoDesignTweak = z.infer<typeof coDesignTweakSchema>;
export type CoDesignImage = z.infer<typeof coDesignImageSchema>;
export const EMPTY_CODESIGN: CoDesignState = {
  kind: "prototype",
  images: [],
  tweaks: [],
  comments: [],
};
/** JSON Schema 用于 Agent 文件生成，额外跨字段不变量在读取/提交时统一验证。 */
export function validateCoDesignState(value: unknown): CoDesignState {
  const state = coDesignStateSchema.parse(value);
  for (const group of [state.images, state.tweaks, state.comments]) {
    if (new Set(group.map((item) => item.id)).size !== group.length)
      throw new Error("Duplicate CoDesign IDs");
  }
  if (new Set(state.tweaks.map((item) => item.token)).size !== state.tweaks.length)
    throw new Error("Duplicate CSS tokens");
  for (const tweak of state.tweaks) {
    if (
      tweak.kind === "number" &&
      (tweak.min > tweak.max || tweak.value < tweak.min || tweak.value > tweak.max)
    )
      throw new Error("CoDesign tweak is outside its range");
  }
  return state;
}
export function parseCoDesignDocument(value: unknown): CoDesignDocument {
  const document = coDesignDocumentSchema.parse(value);
  return { ...document, codesign: validateCoDesignState(document.codesign) };
}
