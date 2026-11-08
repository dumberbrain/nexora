import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** bracket index shown above the title, e.g. "[--]" */
  index?: string;
  action?: ReactNode;
  className?: string;
}

/** Terminal-style empty state: bracket index, display title, muted description, optional action. */
export function EmptyState({
  title,
  description,
  index = "[--]",
  action,
  className,
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-3 border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="text-index" aria-hidden="true">
        {index}
      </span>
      <h2 className="text-xl text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </section>
  );
}
