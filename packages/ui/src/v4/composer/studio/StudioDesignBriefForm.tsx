import type { Dispatch, SetStateAction } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { deriveDesignSystem, type StudioDesignBrief } from "./studioDesign.js";
export const INITIAL: StudioDesignBrief = {
  goal: "",
  audience: "",
  platform: "responsive-web",
  palette: "light-neutral",
  typography: "system-ui",
  layout: "adaptive-grid",
  mood: "restrained",
  density: "comfortable",
  constraints: "",
};
const choices = {
  platform: ["responsive-web", "mobile-app", "desktop-app"],
  palette: ["light-neutral", "dark-neutral", "warm-editorial", "brand-blue"],
  typography: ["system-ui", "serif-editorial", "monospace"],
  layout: ["adaptive-grid", "sidebar-workspace", "single-column"],
  mood: ["restrained", "editorial", "playful"],
  density: ["compact", "comfortable", "spacious"],
} as const;
export function StudioDesignBriefForm({
  brief,
  setBrief,
  busy,
}: {
  brief: StudioDesignBrief;
  setBrief: Dispatch<SetStateAction<StudioDesignBrief>>;
  busy: boolean;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.design.${key}` });
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-2">
      <legend className="mb-2 text-ui-caption font-medium">{t("brief")}</legend>
      {(["goal", "audience"] as const).map((key) => (
        <label key={key} className="block text-ui-caption">
          {t(key)}
          <textarea
            aria-label={t(key)}
            value={brief[key]}
            onChange={(event) => setBrief((current) => ({ ...current, [key]: event.target.value }))}
            className="mt-1 min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
          />
        </label>
      ))}
      <details>
        <summary className="cursor-pointer text-ui-caption">{t("system")}</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(choices).map(([key, values]) => (
            <label key={key} className="min-w-0 text-ui-caption">
              {t(key)}
              <select
                aria-label={t(key)}
                value={brief[key as keyof StudioDesignBrief]}
                onChange={(event) =>
                  setBrief((current) => ({ ...current, [key]: event.target.value }))
                }
                className="mt-1 h-8 w-full rounded-lg border border-input-border bg-input px-2"
              >
                {values.map((value) => (
                  <option key={value} value={value}>
                    {t(`option.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="mt-2 block text-ui-caption">
          {t("constraints")}
          <textarea
            aria-label={t("constraints")}
            value={brief.constraints}
            onChange={(event) =>
              setBrief((current) => ({ ...current, constraints: event.target.value }))
            }
            className="mt-1 min-h-14 w-full rounded-lg border border-input-border bg-input p-2 text-ui-base"
          />
        </label>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-ui-caption">
          {deriveDesignSystem(brief)}
        </pre>
      </details>
    </fieldset>
  );
}
