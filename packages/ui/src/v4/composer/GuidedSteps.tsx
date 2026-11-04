import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function GuidedSteps({
  steps,
  current,
  onChange,
  disabled = false,
  canAdvance = true,
}: {
  steps: readonly string[];
  current: number;
  onChange: (step: number) => void;
  disabled?: boolean;
  canAdvance?: boolean;
}) {
  const { intl } = useZCodeIntl();
  return (
    <nav aria-label={intl.formatMessage({ id: "chat.guide.steps" })} className="mb-3 space-y-2">
      <ol className="flex flex-wrap gap-1">
        {steps.map((id, index) => (
          <li key={id} className="min-w-0">
            <Button
              type="button"
              variant={index === current ? "secondary" : "ghost"}
              aria-current={index === current ? "step" : undefined}
              disabled={disabled || index > current}
              className="h-auto min-h-8 whitespace-normal px-2 text-ui-caption"
              onClick={() => onChange(index)}
            >
              <span className="mr-1 text-foreground-subtle">{index + 1}</span>
              {intl.formatMessage({ id })}
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {current > 0 ? (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange(current - 1)}
          >
            {intl.formatMessage({ id: "chat.guide.back" })}
          </Button>
        ) : null}
        {current < steps.length - 1 && (current === 0 || canAdvance) ? (
          <Button
            type="button"
            disabled={disabled || !canAdvance}
            onClick={() => onChange(current + 1)}
          >
            {intl.formatMessage({ id: "chat.guide.next" })}
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
