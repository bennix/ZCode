import { useMemo } from "react";
import type { ConversationSnapshot, UserInputRow } from "@zcode/shared/zcode-protocol-v4";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { sharedModelContextHealth } from "@/v4/sharedModelContextHealth.js";

interface Props {
  snapshot: Pick<ConversationSnapshot, "rows" | "usage">;
}

/** 已提交事件的只读窗口；模型真正读取的历史仍由 Core messageHistory 唯一拥有。 */
export function SharedModelContextPanel({ snapshot }: Props) {
  const { intl } = useZCodeIntl();
  const recentUserInputs = useMemo(
    () =>
      snapshot.rows.window
        .filter((row): row is UserInputRow => row.kind === "userInput" && row.origin === "realUser")
        .slice(-3),
    [snapshot.rows.window],
  );
  const compacted = useMemo(
    () =>
      snapshot.rows.window.some(
        (row) =>
          row.kind === "timelineMarker" &&
          row.marker.type === "compact" &&
          row.marker.status === "success",
      ),
    [snapshot.rows.window],
  );
  const usedTokens = snapshot.usage.contextWindow?.usedTokens;
  const health = sharedModelContextHealth(snapshot.usage);

  return (
    <details className="mx-4 mb-2 rounded-lg border border-border bg-surface text-ui-base lg:mx-8">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-foreground">
        <span className="font-medium">
          {intl.formatMessage({ id: "chat.sharedContext.title" })}
        </span>
        {usedTokens !== undefined ? (
          <span className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "chat.sharedContext.usedTokens" }, { count: usedTokens })}
          </span>
        ) : null}
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-2 text-foreground-subtle">
        <p>{intl.formatMessage({ id: "chat.sharedContext.description" })}</p>
        {health.contextNearLimit ? (
          <p className="text-ui-sm text-warning">
            {intl.formatMessage({ id: "chat.sharedContext.nearLimit" })}
          </p>
        ) : null}
        {health.latestCacheHitLow ? (
          <p className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "chat.sharedContext.cacheLow" })}
          </p>
        ) : null}
        {compacted ? (
          <p className="text-ui-sm">{intl.formatMessage({ id: "chat.sharedContext.compacted" })}</p>
        ) : null}
        {recentUserInputs.length > 0 ? (
          <ol className="space-y-1">
            {recentUserInputs.map((row) => (
              <li key={row.rowId} className="min-w-0 text-ui-sm">
                <span className="block truncate text-foreground" title={row.text}>
                  {row.text}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-ui-sm">{intl.formatMessage({ id: "chat.sharedContext.empty" })}</p>
        )}
        {snapshot.rows.totalCount > snapshot.rows.window.length ? (
          <p className="text-ui-sm">
            {intl.formatMessage({ id: "chat.sharedContext.windowLimited" })}
          </p>
        ) : null}
      </div>
    </details>
  );
}
