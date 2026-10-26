import { useRef } from "react";
import { parseCoDesignDocument, type CoDesignState, type CoDesignDocument } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function StudioCoDesignControls({
  value,
  disabled,
  hasHtml,
  revision,
  canExport,
  selecting,
  selection,
  note,
  progress,
  onChange,
  onImport,
  onExport,
  onImages,
  onSelecting,
  onNote,
  onEdit,
  onError,
}: {
  revision: string;
  canExport: boolean;
  value: CoDesignState;
  disabled: boolean;
  hasHtml: boolean;
  selecting: boolean;
  selection: { elementId: string; quote: string } | null;
  note: string;
  progress: string;
  onChange: (state: CoDesignState) => void;
  onImport: (document: CoDesignDocument) => void;
  onExport: () => void;
  onImages: () => void;
  onSelecting: (value: boolean) => void;
  onNote: (value: string) => void;
  onEdit: () => void;
  onError: (error: string) => void;
}) {
  const current = useRef({ disabled, revision });
  current.current = { disabled, revision };
  const importSequence = useRef(0);
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.codesign.${key}` });
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-xl border border-border bg-surface p-3"
      data-testid="studio-codesign-controls"
    >
      <legend className="text-ui-base font-medium">{t("title")}</legend>
      <p className="text-ui-caption text-foreground-subtle">{t("guide")}</p>
      <div className="flex flex-wrap items-center gap-2 text-ui-caption">
        <label>
          {t("format")}{" "}
          <select
            aria-label={t("format")}
            value={value.kind}
            className="h-8 rounded-lg border border-input-border bg-input px-2"
            onChange={(event) =>
              onChange({ ...value, kind: event.target.value as CoDesignState["kind"] })
            }
          >
            {(["prototype", "poster", "report", "slides"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          {t("import")}{" "}
          <input
            type="file"
            aria-label={t("import")}
            accept=".json,application/json"
            className="max-w-full text-ui-xs"
            onChange={async (event) => {
              const sequence = ++importSequence.current;
              const original = revision;
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                if (file.size > 34 * 1024 * 1024) throw new Error(t("tooLarge"));
                const document = parseCoDesignDocument(JSON.parse(await file.text()));
                if (
                  sequence === importSequence.current &&
                  !current.current.disabled &&
                  current.current.revision === original
                )
                  onImport(document);
              } catch (error) {
                onError(error instanceof Error ? error.message : String(error));
              }
            }}
          />
        </label>
        <Button variant="outline" disabled={!hasHtml || !canExport} onClick={onExport}>
          {t("export")}
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-ui-caption font-medium">{t("images")}</h4>
          <Button variant="outline" disabled={!hasHtml || !value.images.length} onClick={onImages}>
            {t("generateImages")} ({value.images.length})
          </Button>
        </div>
        <p className="text-ui-xs text-foreground-subtle">{t("imageHint")}</p>
        {value.images.map((image) => (
          <div key={image.id} className="rounded-lg border border-border p-2 text-ui-caption">
            <span className="font-medium">
              {image.id} · {image.ratio}
            </span>
            <p>{image.prompt}</p>
          </div>
        ))}
        {progress ? (
          <p role="status" className="text-ui-caption">
            {progress}
          </p>
        ) : null}
      </div>
      {value.tweaks.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {value.tweaks.map((tweak) => (
            <label key={tweak.id} className="flex min-w-0 items-center gap-2 text-ui-caption">
              {tweak.label}
              {tweak.kind === "color" ? (
                <input
                  type="color"
                  aria-label={tweak.label}
                  value={tweak.value}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      tweaks: value.tweaks.map((item) =>
                        item.id === tweak.id ? { ...tweak, value: event.target.value } : item,
                      ),
                    })
                  }
                />
              ) : (
                <input
                  type="range"
                  aria-label={tweak.label}
                  min={tweak.min}
                  max={tweak.max}
                  step="any"
                  value={tweak.value}
                  className="min-w-0 flex-1"
                  onChange={(event) =>
                    onChange({
                      ...value,
                      tweaks: value.tweaks.map((item) =>
                        item.id === tweak.id
                          ? { ...tweak, value: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              )}
              <span>
                {tweak.value}
                {tweak.kind === "number" ? tweak.unit : ""}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-ui-caption">
          <input
            type="checkbox"
            checked={selecting}
            disabled={!hasHtml}
            onChange={(event) => onSelecting(event.target.checked)}
          />
          {t("select")}
        </label>
        {selection ? (
          <p className="text-ui-caption">
            {selection.elementId} · {selection.quote}
          </p>
        ) : null}
        <textarea
          aria-label={t("comment")}
          placeholder={t("comment")}
          value={note}
          onChange={(event) => onNote(event.target.value)}
          className="min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
        />
        <Button disabled={!selection || !note.trim()} onClick={onEdit}>
          {t("applyComment")}
        </Button>
        {value.comments.map((comment) => (
          <p key={comment.id} className="text-ui-caption text-foreground-subtle">
            {comment.elementId} · {comment.note}
          </p>
        ))}
      </div>
    </fieldset>
  );
}
