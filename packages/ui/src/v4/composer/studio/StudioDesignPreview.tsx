import { memo, useMemo } from "react";
import { isolateDesignDocument } from "./studioDesign.js";

/** 预览与表单/项目列表独立提交，避免无关渲染重置原型内部的交互状态。 */
export const StudioDesignPreview = memo(function StudioDesignPreview({
  html,
  mobile,
  title,
}: {
  html: string;
  mobile: boolean;
  title: string;
}) {
  const document = useMemo(() => isolateDesignDocument(html), [html]);
  return (
    <div className="overflow-auto rounded-xl border border-border bg-surface p-1">
      <iframe
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
