import { memo, useMemo, useRef, useLayoutEffect } from "react";
import {
  acceptCoDesignSelection,
  coDesignSelectionScript,
  type CoDesignSelection,
} from "./coDesignDocument.js";
import { isolateDesignDocument } from "./studioDesign.js";

/** 预览与表单/项目列表独立提交，避免无关渲染重置原型内部的交互状态。 */
export const StudioDesignPreview = memo(function StudioDesignPreview({
  html,
  mobile,
  title,
  selecting = false,
  onSelection,
}: {
  html: string;
  mobile: boolean;
  title: string;
  selecting?: boolean;
  onSelection?: (selection: CoDesignSelection) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(() => crypto.randomUUID(), [html, selecting]);
  const document = useMemo(
    () =>
      isolateDesignDocument(
        selecting
          ? html.replace(/<body([^>]*)>/iu, (match) => match + coDesignSelectionScript(nonce))
          : html,
      ),
    [html, selecting, nonce],
  );
  useLayoutEffect(() => {
    if (!selecting) return;
    // 沙箱消息必须同时匹配当前窗口与当前文档，防止旧预览修改新版本。
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const selection = acceptCoDesignSelection(event.data, nonce);
      if (
        selection &&
        new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector(`[data-zencode-design-id="${selection.elementId}"]`)
      )
        onSelection?.(selection);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [html, nonce, selecting, onSelection]);
  return (
    <div className="overflow-auto rounded-xl border border-border bg-surface p-1">
      <iframe
        ref={frame}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={document}
        className="mx-auto h-96 max-w-full border-0 bg-background"
        style={{ width: mobile ? 390 : "100%" }}
      />
    </div>
  );
});
