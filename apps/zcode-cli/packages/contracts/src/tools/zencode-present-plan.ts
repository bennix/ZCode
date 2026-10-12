import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const ZENCODE_PRESENT_PLAN_TOOL_NAME = "zencode_present_plan";

const FileSchema = z
  .object({
    path: z.string().trim().min(1).max(512),
    intent: z.enum(["edit", "create", "delete"]),
    reason: z.string().trim().min(1).max(240),
  })
  .strict();

const PresentPlanBaseSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    files: z.array(FileSchema).min(1).max(24),
  })
  .strict();

function validatePaths(
  input: z.infer<typeof PresentPlanBaseSchema>,
  context: z.RefinementCtx,
): void {
    const seen = new Set<string>();
    input.files.forEach((file, index) => {
      const normalized = file.path.replaceAll("\\", "/");
      const segments = normalized.split("/");
      if (
        normalized.startsWith("/") ||
        /^[a-z]:/iu.test(normalized) ||
        segments.some((segment) => segment === ".." || segment === "." || !segment) ||
        /[\u0000-\u001f]/u.test(normalized)
      ) {
        context.addIssue({ code: "custom", message: "Path must be workspace-relative", path: ["files", index, "path"] });
      }
      if (seen.has(normalized)) {
        context.addIssue({ code: "custom", message: "Duplicate path", path: ["files", index, "path"] });
      }
      seen.add(normalized);
    });
}

export const ZencodePresentPlanInputSchema = PresentPlanBaseSchema.superRefine(validatePaths);

export const ZencodePresentPlanAnsweredInputSchema = PresentPlanBaseSchema.extend({
  selectedPaths: z.array(z.string()).min(1).max(24),
}).superRefine((input, context) => {
  validatePaths(input, context);
  const candidates = new Set(input.files.map((file) => file.path));
  const selected = new Set(input.selectedPaths);
  if (selected.size !== input.selectedPaths.length || input.selectedPaths.some((path) => !candidates.has(path))) {
    context.addIssue({ code: "custom", message: "Selection must be a unique subset of offered files", path: ["selectedPaths"] });
  }
});

export const ZencodePresentPlanOutputSchema = z
  .object({ status: z.literal("confirmed"), selectedPaths: z.array(z.string()).min(1).max(24) })
  .strict();

export const ZencodePresentPlanInputJsonSchema = toToolJsonSchema(ZencodePresentPlanInputSchema);
export const ZencodePresentPlanOutputJsonSchema = toToolJsonSchema(ZencodePresentPlanOutputSchema);
export type ZencodePresentPlanInput = z.infer<typeof ZencodePresentPlanInputSchema>;
