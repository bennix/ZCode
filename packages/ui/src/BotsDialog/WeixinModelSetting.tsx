import type { ModelSelection } from "@zcode/shared";
import type { ModelSelectionView } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

export function WeixinModelSetting({
  selection,
  view,
  onChange,
}: {
  selection?: ModelSelection;
  view?: ModelSelectionView;
  onChange: (selection: ModelSelection | undefined) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const models =
    view?.providers.flatMap((provider) =>
      provider.models.map((model) => ({
        providerId: provider.providerId,
        modelId: model.modelId,
        label: `${provider.providerName || provider.providerId} / ${model.modelId}`,
        levels: model.config.optionSpecs.reasoningLevel?.values ?? [],
      })),
    ) ?? [];
  const key = (value: ModelSelection) => JSON.stringify([value.providerId, value.modelId]);
  const effective = selection ?? view?.preferredSelection;
  const selected = models.find((model) => effective && key(model) === key(effective));
  const className = "max-w-full rounded-md border border-border bg-surface px-2 py-1 text-ui-base";
  return (
    <SettingsGroupCard>
      <SettingsRow
        label={t("bots.weixinModel.title")}
        description={t("bots.weixinModel.description")}
        control={
          <select
            aria-label={t("bots.weixinModel.title")}
            className={className}
            value={selection ? key(selection) : ""}
            disabled={!view}
            onChange={(event) => {
              const model = models.find((item) => key(item) === event.target.value);
              onChange(
                model ? { providerId: model.providerId, modelId: model.modelId } : undefined,
              );
            }}
          >
            <option value="">{t("bots.weixinModel.follow")}</option>
            {selection && !models.some((item) => key(item) === key(selection)) ? (
              <option value={key(selection)}>{selection.modelId}</option>
            ) : null}
            {models.map((model) => (
              <option key={key(model)} value={key(model)}>
                {model.label}
              </option>
            ))}
          </select>
        }
      />
      <SettingsRow
        label={t("bots.weixinModel.reasoning")}
        description={t("bots.weixinModel.reasoningHint")}
        control={
          <select
            aria-label={t("bots.weixinModel.reasoning")}
            className={className}
            value={effective?.options?.reasoningLevel ?? ""}
            disabled={!selected?.levels.length}
            onChange={(event) => {
              if (!effective) return;
              const options = {
                ...effective.options,
                reasoningLevel: event.target.value || undefined,
              };
              onChange({ ...effective, options });
            }}
          >
            <option value="">{t("bots.weixinModel.modelDefault")}</option>
            {selected?.levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        }
      />
    </SettingsGroupCard>
  );
}
