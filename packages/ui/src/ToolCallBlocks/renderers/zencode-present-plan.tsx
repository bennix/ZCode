import { FileCheck2Icon } from "lucide-react";
import { ToolLayout } from "@/ToolCallBlocks/ToolLayout.js";
import type { ToolCallBlockRenderContext } from "@/ToolCallBlocks/shared.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

interface FileItem {
  path: string;
  intent: string;
  reason: string;
}

function readPlan(
  value: unknown,
): { title: string; files: FileItem[]; selectedPaths: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || !Array.isArray(record.files)) return null;
  const files = record.files.flatMap((item): FileItem[] => {
    if (!item || typeof item !== "object") return [];
    const file = item as Record<string, unknown>;
    return typeof file.path === "string" &&
      typeof file.intent === "string" &&
      typeof file.reason === "string"
      ? [{ path: file.path, intent: file.intent, reason: file.reason }]
      : [];
  });
  if (!files.length) return null;
  return {
    title: record.title,
    files,
    selectedPaths: Array.isArray(record.selectedPaths)
      ? record.selectedPaths.filter((path): path is string => typeof path === "string")
      : [],
  };
}

export function ZencodePresentPlanToolCallBlock(context: ToolCallBlockRenderContext) {
  const { intl } = useZCodeIntl();
  const { toolCall } = context.toolCallNode;
  const plan = readPlan(toolCall.input);
  const output =
    toolCall.output && typeof toolCall.output === "object"
      ? (toolCall.output as Record<string, unknown>)
      : {};
  const outputSelected = Array.isArray(output.selectedPaths)
    ? output.selectedPaths.filter((path): path is string => typeof path === "string")
    : [];
  const selected = new Set(outputSelected.length ? outputSelected : (plan?.selectedPaths ?? []));
  return (
    <ToolLayout
      toolId={toolCall.toolId}
      icon={<FileCheck2Icon className="size-4 text-brand" />}
      showIcon={context.showIcon !== false}
      canToggle={context.canToggle ?? true}
      kindLabel={intl.formatMessage({ id: "filePlan.panel.title" })}
      sourceLabel={context.sourceLabel}
      primaryText={
        <span className="min-w-0 truncate text-ui-base">{plan?.title ?? toolCall.title}</span>
      }
      secondaryText={plan ? `${selected.size}/${plan.files.length}` : context.statusLabel}
      statusLabel={toolCall.status === "failed" ? context.statusLabel : undefined}
      statusTooltip={toolCall.status === "failed" ? context.errorText : undefined}
      showFailureStatus={toolCall.status === "failed"}
      isRunning={context.isRunning}
      title={toolCall.title}
      renderContent={() =>
        plan ? (
          <div className="space-y-1 rounded-xl bg-surface px-3 py-2">
            {plan.files.map((file) => (
              <div key={file.path} className="flex min-w-0 items-start gap-2 py-1 text-ui-base">
                <span
                  aria-hidden="true"
                  className={selected.has(file.path) ? "text-success" : "text-foreground-subtlest"}
                >
                  {selected.has(file.path) ? "✓" : "○"}
                </span>
                <div className="min-w-0">
                  <div className="break-all font-mono">{file.path}</div>
                  <div className="text-ui-sm text-foreground-subtle">
                    {file.intent}: {file.reason}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null
      }
    />
  );
}
