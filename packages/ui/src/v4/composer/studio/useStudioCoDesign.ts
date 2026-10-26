import { useRef, useState, type RefObject } from "react";
import { EMPTY_CODESIGN, validateCoDesignState, type CoDesignState } from "@zcode/shared";
import { useStudioMediaLibrary } from "@/hooks/useStudioMediaLibrary.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  applyCoDesignTweaks,
  syncCoDesignMetadata,
  type CoDesignSelection,
} from "./coDesignDocument.js";
import {
  generateCoDesignImages,
  resolveCoDesignImageRatio,
  reviseCoDesignElement,
} from "./coDesignGeneration.js";

export function useStudioCoDesign(input: {
  html: string;
  apiKey: string;
  model: string;
  busy: boolean;
  reasoning?: Record<string, unknown>;
  run: RefObject<AbortController | null>;
  onBusy: (busy: boolean) => void;
  onError: (error: string) => void;
  onOutput: (text: string) => void;
  onCommit: (html: string, metadata: CoDesignState) => void;
}) {
  const { intl } = useZCodeIntl();
  const { library, loading, error } = useStudioMediaLibrary();
  const [metadata, setMetadata] = useState<CoDesignState>(EMPTY_CODESIGN);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<CoDesignSelection | null>(null);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState("");
  const admitted = useRef(false);
  const commit = (html: string, state: CoDesignState) => {
    const checked = validateCoDesignState(state);
    setMetadata(checked);
    setSelection(null);
    input.onCommit(syncCoDesignMetadata(html, checked), checked);
  };
  const execute = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (input.busy || admitted.current) return;
    if (!input.apiKey) {
      input.onError(intl.formatMessage({ id: "chat.studio.codesign.missingKey" }));
      return;
    }
    admitted.current = true;
    input.run.current?.abort();
    const controller = new AbortController();
    input.run.current = controller;
    input.onBusy(true);
    input.onError("");
    setProgress("");
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted)
        input.onError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      admitted.current = false;
      if (input.run.current === controller) {
        input.onBusy(false);
        setProgress("");
      }
    }
  };
  return {
    metadata,
    setMetadata,
    selecting,
    selection,
    setSelection,
    note,
    setNote,
    progress,
    reset: (state: CoDesignState = EMPTY_CODESIGN) => {
      setMetadata(validateCoDesignState(state));
      setSelection(null);
      setNote("");
      setSelecting(false);
    },
    change: (state: CoDesignState) => {
      if (input.busy) return;
      try {
        const checked = validateCoDesignState(state);
        if (input.html) commit(applyCoDesignTweaks(input.html, checked.tweaks), checked);
        else setMetadata(checked);
      } catch (failure) {
        input.onError(String(failure));
      }
    },
    toggleSelection: (value: boolean) => {
      setSelecting(value);
      setSelection(null);
    },
    generateImages: () =>
      execute(async (signal) => {
        if (loading || error) throw new Error("Image model settings are unavailable");
        for (const plan of metadata.images)
          resolveCoDesignImageRatio(library.defaultImageId, plan.ratio);
        await generateCoDesignImages({
          html: input.html,
          state: metadata,
          apiKey: input.apiKey,
          model: library.defaultImageId,
          signal,
          onProgress: (current, total) => {
            if (!signal.aborted)
              setProgress(
                intl.formatMessage(
                  { id: "chat.studio.codesign.imageProgress" },
                  { current, total },
                ),
              );
          },
          onCommit: (html, state) => {
            if (!signal.aborted) commit(html, state);
          },
        });
      }),
    applyComment: () =>
      execute(async (signal) => {
        if (!selection || !note.trim()) return;
        const next = await reviseCoDesignElement({
          html: input.html,
          elementId: selection.elementId,
          note,
          apiKey: input.apiKey,
          model: input.model,
          signal,
          reasoning: input.reasoning,
          onOutput: (text) => {
            if (!signal.aborted) input.onOutput(text);
          },
        });
        if (signal.aborted) return;
        const comment = {
          id: `comment-${crypto.randomUUID()}`,
          elementId: selection.elementId,
          quote: selection.quote,
          note: note.trim(),
        };
        commit(next, { ...metadata, comments: [...metadata.comments, comment].slice(-32) });
        setNote("");
      }),
  };
}
