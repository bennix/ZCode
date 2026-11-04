import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function StudioDesignPreviewToolbar({
  html,
  versions,
  mobile,
  busy,
  onMobile,
  onVersion,
}: {
  html: string;
  versions: readonly string[];
  mobile: boolean;
  busy: boolean;
  onMobile: (mobile: boolean) => void;
  onVersion: (index: number) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.design.${key}` });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={mobile ? "ghost" : "secondary"} onClick={() => onMobile(false)}>
        {t("desktop")}
      </Button>
      <Button variant={mobile ? "secondary" : "ghost"} onClick={() => onMobile(true)}>
        {t("mobile")}
      </Button>
      <select
        aria-label={t("versions")}
        value={String(versions.findLastIndex((version) => version === html))}
        disabled={busy}
        className="h-8 rounded-lg border border-input-border bg-input text-ui-caption"
        onChange={(event) => onVersion(Number(event.target.value))}
      >
        {versions.map((_, index) => (
          <option key={index} value={index}>
            {t("version")} {index + 1}
          </option>
        ))}
      </select>
    </div>
  );
}
