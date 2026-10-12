import { CircleCheckIcon, CircleDotIcon } from "lucide-react";
import { ToolLayout } from "@/ToolCallBlocks/ToolLayout.js";
import type { ToolCallBlockRenderContext } from "@/ToolCallBlocks/shared.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

type ProgressStage = "analysis" | "editing" | "verification" | "complete";

function readProgress(value: unknown): { stage: ProgressStage; summary: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.stage !== "analysis" &&
    record.stage !== "editing" &&
    record.stage !== "verification" &&
    record.stage !== "complete"
  )
    return null;
  if (typeof record.summary !== "string" || !record.summary.trim()) return null;
  return { stage: record.stage, summary: record.summary.slice(0, 240) };
}

export function ZencodeProgressToolCallBlock(context: ToolCallBlockRenderContext) {
  const { intl } = useZCodeIntl();
  const { toolCall } = context.toolCallNode;
  const progress = readProgress(toolCall.input) ?? readProgress(toolCall.output);
  const label = progress
    ? intl.formatMessage({ id: `progress.stage.${progress.stage}` })
    : intl.formatMessage({ id: "progress.stage.unknown" });
  return (
    <ToolLayout
      toolId={toolCall.toolId}
      icon={
        progress?.stage === "complete" ? (
          <CircleCheckIcon className="size-4 text-success" />
        ) : (
          <CircleDotIcon className="size-4 text-brand" />
        )
      }
      showIcon={context.showIcon !== false}
      canToggle={false}
      kindLabel={intl.formatMessage({ id: "progress.panel.title" })}
      sourceLabel={context.sourceLabel}
      primaryText={
        <span className="min-w-0 truncate text-ui-base">{progress?.summary ?? toolCall.title}</span>
      }
      secondaryText={<span className="text-ui-sm text-foreground-subtle">{label}</span>}
      statusLabel={toolCall.status === "failed" ? context.statusLabel : undefined}
      statusTooltip={toolCall.status === "failed" ? context.errorText : undefined}
      showFailureStatus={toolCall.status === "failed"}
      isRunning={context.isRunning}
      title={toolCall.title}
      renderContent={() =>
        progress ? <p className="text-ui-base text-foreground">{progress.summary}</p> : null
      }
    />
  );
}
