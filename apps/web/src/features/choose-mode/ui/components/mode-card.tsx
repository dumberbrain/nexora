import { type ComponentProps } from "react";

import { EXECUTION_MODE_LABEL, type ModeOption } from "@/entities/execution";
import { cn } from "@/shared/lib/cn";

interface ModeCardProps extends Omit<ComponentProps<"input">, "type" | "value" | "disabled"> {
  option: ModeOption;
}

/**
 * One selectable mode (US2-AS2): recommended badge + rationale; unavailable modes stay visible
 * but disabled, with the reason and how to enable them.
 */
export function ModeCard({ option, className, ...radio }: ModeCardProps) {
  const descId = `mode-${option.mode}-desc`;
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 border border-border bg-card p-3 transition-colors has-checked:border-phosphor has-checked:shadow-glow has-focus-visible:ring-2 has-focus-visible:ring-ring",
        !option.available && "cursor-not-allowed border-dashed opacity-80",
        className,
      )}
    >
      <input
        type="radio"
        value={option.mode}
        disabled={!option.available}
        aria-describedby={descId}
        className="mt-1 accent-(--phosphor)"
        {...radio}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-display text-sm">{EXECUTION_MODE_LABEL[option.mode]}</span>
          {option.recommended ? (
            <span className="border border-phosphor/60 bg-phosphor/10 px-1.5 py-0.5 font-mono text-[10px] text-phosphor uppercase">
              recommended
            </span>
          ) : null}
          {option.available ? null : (
            <span className="border border-dashed border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
              unavailable
            </span>
          )}
        </span>
        <span id={descId} className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{option.reason}</span>
          {option.available ? null : (
            <>
              <span className="text-status-paused">
                Why unavailable: {option.unavailableReason ?? "not supported here"}
              </span>
              {option.howToEnable ? <span>How to enable: {option.howToEnable}</span> : null}
            </>
          )}
        </span>
      </span>
    </label>
  );
}
