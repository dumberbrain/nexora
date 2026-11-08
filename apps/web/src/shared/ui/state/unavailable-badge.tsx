import { useId } from "react";

import { cn } from "@/shared/lib/cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";

interface UnavailableBadgeProps {
  /** why the value/control is unavailable — e.g. "runtime does not report usage" */
  reason: string;
  label?: string;
  className?: string;
}

/**
 * Explicit "not available" marker (FR-029, FR-031): never show 0 or an empty cell for data the
 * runtime did not report. The reason is visible on hover/focus and always to screen readers.
 */
export function UnavailableBadge({
  reason,
  label = "not available",
  className,
}: UnavailableBadgeProps) {
  const id = useId();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-describedby={id}
          className={cn(
            "inline-flex items-center gap-1 border border-dashed border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
            className,
          )}
        >
          <span aria-hidden="true">--</span>
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
}
