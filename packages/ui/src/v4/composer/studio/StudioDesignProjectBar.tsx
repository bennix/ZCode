import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { StudioDesignProject } from "@/hooks/useStudioDesignProjects.js";
export function StudioDesignProjectBar({
  records,
  projectId,
  disabled,
  hasHtml,
  saved,
  error,
  onOpen,
  onNew,
  onSave,
  onDelete,
}: {
  records: StudioDesignProject[];
  projectId: string;
  disabled: boolean;
  hasHtml: boolean;
  saved: boolean;
  error: boolean;
  onOpen: (record: StudioDesignProject) => void;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.design.${key}` });
  const exists = records.some((record) => record.id === projectId);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("projects")}
          value={exists ? projectId : ""}
          disabled={disabled}
          className="h-8 max-w-full rounded-lg border border-input-border bg-input px-2 text-ui-caption"
          onChange={(event) => {
            const record = records.find((item) => item.id === event.target.value);
            if (record) onOpen(record);
          }}
        >
          <option value="" disabled>
            {t("projects")}
          </option>
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.title}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={disabled} onClick={onNew}>
          {t("new")}
        </Button>
        <Button variant="outline" disabled={disabled || !hasHtml} onClick={onSave}>
          {t("save")}
        </Button>
        <Button variant="ghost" disabled={disabled || !exists} onClick={onDelete}>
          {t("delete")}
        </Button>
        {saved ? (
          <span role="status" className="text-ui-xs text-foreground-subtle">
            {t("saved")}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {t("storageError")}
        </p>
      ) : null}
    </>
  );
}
