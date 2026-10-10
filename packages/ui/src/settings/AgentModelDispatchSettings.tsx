import { useState } from "react";
import type { ModelSelection } from "@zcode/shared";
import { ModelConfigSelect, type ModelSelectGroup } from "@/ModelConfigSelect.js";
import { Switch } from "@/components/ui/switch.js";
import { toast } from "@/components/ui/toast.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";
import { parseModelPickerValue } from "@/lib/zcodeSessionProjection.js";
import { resolveModelDisplayName } from "@/lib/modelSelectionGroups.js";

interface Props {
  modelGroups: readonly ModelSelectGroup[];
  onManageModels?: () => void;
}

function pickerValue(selection: ModelSelection | null | undefined): string {
  return selection ? encodeCustomModelValue(selection.providerId, selection.modelId) : "";
}

export function AgentModelDispatchSettings({ modelGroups, onManageModels }: Props) {
  const { intl } = useZCodeIntl();
  const { settings, loading, update } = useSettings();
  const [saving, setSaving] = useState(false);
  const selected = settings?.agentModelDispatcher;
  const value = pickerValue(selected);
  const available = modelGroups.some((group) => group.items.some((item) => item.value === value));
  const enabled = settings?.agentModelDispatchEnabled === true;

  async function save(patch: Parameters<typeof update>[0]) {
    setSaving(true);
    try {
      await update(patch);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-ui-lg font-semibold text-foreground">
            {intl.formatMessage({ id: "settings.agentDispatch.title" })}
          </h3>
          <p className="text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.agentDispatch.description" })}
          </p>
        </div>
        <Switch
          checked={enabled}
          // 修复依据：模型目录失效时已开启的开关仍须可关闭；只禁止在无可用模型时开启。
          disabled={loading || saving || (!available && !enabled)}
          aria-label={intl.formatMessage({ id: "settings.agentDispatch.enabled" })}
          onCheckedChange={(checked) => void save({ agentModelDispatchEnabled: checked })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.agentDispatch.model" })}
        </span>
        <ModelConfigSelect
          modelGroups={modelGroups}
          normalizedValue={value}
          triggerLabel={
            resolveModelDisplayName(modelGroups, value) ??
            intl.formatMessage({ id: "settings.agentDispatch.chooseModel" })
          }
          showManageModelsAction={Boolean(onManageModels)}
          lockReasonMessage=""
          isItemLocked={() => false}
          onValueChange={(nextValue) => {
            const selection = parseModelPickerValue(nextValue);
            void save({ agentModelDispatcher: selection });
          }}
          manageModelsLabel={intl.formatMessage({ id: "chat.toolbar.model.manageModels" })}
          onManageModels={onManageModels}
          contentSide="bottom"
          focusSelectorOnClose={null}
          disabled={loading || saving || modelGroups.length === 0}
          triggerClassName="h-8 min-w-40 justify-between rounded-lg border border-input-border bg-input px-3 text-foreground"
        />
      </div>
      {enabled && !available ? (
        <p className="text-ui-base text-warning">
          {intl.formatMessage({ id: "settings.agentDispatch.unavailable" })}
        </p>
      ) : null}
      <p className="text-ui-sm text-foreground-subtle">
        {intl.formatMessage({ id: "settings.agentDispatch.fallback" })}
      </p>
    </section>
  );
}
