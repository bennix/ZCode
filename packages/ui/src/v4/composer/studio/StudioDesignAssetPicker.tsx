import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
export function StudioDesignAssetPicker({
  sourceImageUrl,
  asset,
  disabled,
  loading,
  onLoadingChange,
  onChange,
  onError,
}: {
  sourceImageUrl?: string | null;
  asset: string;
  disabled: boolean;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
  onChange: (data: string) => void;
  onError: (error: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `chat.studio.design.${key}` });
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), []);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={disabled || loading || !sourceImageUrl}
        onClick={async () => {
          if (!sourceImageUrl || loading) return;
          const controller = new AbortController();
          run.current = controller;
          onLoadingChange(true);
          onError("");
          try {
            const response = await fetch(sourceImageUrl, { signal: controller.signal });
            if (!response.ok) throw new Error(t("assetError"));
            const blob = await response.blob();
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error(t("assetError")));
              reader.readAsDataURL(blob);
            });
            controller.signal.throwIfAborted();
            onChange(data);
          } catch (failure) {
            if (!controller.signal.aborted)
              onError(failure instanceof Error ? failure.message : String(failure));
          } finally {
            if (!controller.signal.aborted) onLoadingChange(false);
          }
        }}
      >
        {t("useImage")}
      </Button>
      {asset ? (
        <>
          <img src={asset} alt={t("asset")} className="size-16 rounded-lg object-contain" />
          <Button variant="ghost" disabled={disabled || loading} onClick={() => onChange("")}>
            {t("removeImage")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
