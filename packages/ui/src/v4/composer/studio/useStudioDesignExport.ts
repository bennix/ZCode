import { parseCoDesignDocument, type CoDesignState } from "@zcode/shared";
import type { StudioDesignBrief } from "@/store/studioDesignHistory.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { deriveDesignSystem, isolateDesignDocument } from "./studioDesign.js";

export function useStudioDesignExport(input: {
  html: string;
  brief: StudioDesignBrief;
  draftBrief: StudioDesignBrief;
  codesign: CoDesignState;
  onError: (error: string) => void;
}) {
  const platform = usePlatform();
  return async (kind: "html" | "system" | "codesign") => {
    if (!platform.saveFile) return;
    try {
      let text: string;
      let suggestedName: string;
      if (kind === "codesign") {
        text = JSON.stringify(
          parseCoDesignDocument({
            version: 1,
            html: input.html,
            brief: input.draftBrief,
            codesign: input.codesign,
          }),
          null,
          2,
        );
        suggestedName = "zencode-design.zencode-design.json";
      } else {
        text =
          kind === "html" ? isolateDesignDocument(input.html) : deriveDesignSystem(input.brief);
        suggestedName = kind === "html" ? "zencode-prototype.html" : "DESIGN.md";
      }
      const result = await platform.saveFile({
        suggestedName,
        data: new TextEncoder().encode(text).buffer,
      });
      if (!result.success && result.error) input.onError(result.error);
    } catch (failure) {
      input.onError(
        kind === "codesign"
          ? String(failure)
          : failure instanceof Error
            ? failure.message
            : String(failure),
      );
    }
  };
}
