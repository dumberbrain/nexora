import { cn } from "@/shared/lib/cn";

import { Skeleton } from "../skeleton";

interface LoadingStateProps {
  /** what is loading, announced to screen readers */
  label: string;
  rows?: number;
  className?: string;
}

/** Skeleton rows with an accessible busy region. */
export function LoadingState({ label, rows = 3, className }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn("space-y-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-sm" />
      ))}
    </div>
  );
}
