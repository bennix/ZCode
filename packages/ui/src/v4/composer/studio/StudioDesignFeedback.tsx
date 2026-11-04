import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function StudioDesignFeedback({
  feedback,
  busy,
  canRevise,
  canSave,
  onFeedback,
  onRevise,
  onSave,
}: {
  feedback: string;
  busy: boolean;
  canRevise: boolean;
  canSave: boolean;
  onFeedback: (value: string) => void;
  onRevise: () => void;
  onSave: (kind: "html" | "system") => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.design.${key}` });
  return (
    <>
      <label className="block text-ui-caption">
        {t("feedback")}
        <textarea
          aria-label={t("feedback")}
          value={feedback}
          disabled={busy}
          onChange={(event) => onFeedback(event.target.value)}
          className="mt-1 min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !canRevise || !feedback.trim()} onClick={onRevise}>
          {t("revise")}
        </Button>
        <Button variant="outline" disabled={busy || !canSave} onClick={() => onSave("html")}>
          {t("exportHtml")}
        </Button>
        <Button variant="outline" disabled={busy || !canSave} onClick={() => onSave("system")}>
          {t("exportSystem")}
        </Button>
      </div>
      {!canSave ? <p className="text-ui-caption">{t("noSave")}</p> : null}
    </>
  );
}
