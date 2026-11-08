import { ClockAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";

interface StaleIndicatorProps {
  /** from sessionStaleReason — renders nothing when null */
  reason: string | null;
  className?: string;
}

/** Marks data that may be out of date, with the reason in text (not colour alone). */
export function StaleIndicator({ reason, className }: StaleIndicatorProps) {
  if (reason === null) return null;
  return (
    <span
      role="note"
      title={reason}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-status-paused uppercase",
        className,
      )}
    >
      <ClockAlertIcon className="size-3" aria-hidden="true" />
      stale
      <span className="sr-only">: {reason}</span>
    </span>
  );
}
