import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { GuidedSteps } from "./GuidedSteps.js";

/** 展示外壳不拥有步骤或任务状态，两个入口继续通过各自的 hook 提交。 */
export function GuidedWorkspaceFrame({
  title,
  description,
  steps,
  children,
  className,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title: ReactNode;
  description: ReactNode;
  steps: ComponentProps<typeof GuidedSteps>;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card text-ui-base",
        className,
      )}
      {...props}
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <h2 className="text-ui-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-prose text-ui-caption leading-5 text-foreground-subtle">
          {description}
        </p>
      </header>
      <div className="p-4 sm:p-5">
        <GuidedSteps {...steps} />
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
