import { TriangleAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";

import { Button } from "../button";

interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unexpected error";
}

/** Surface failures with context instead of hiding them (constitution III). */
export function ErrorState({
  title = "Something failed",
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <section
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 border border-destructive/50 bg-destructive/5 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-destructive">
        <TriangleAlertIcon className="size-4" aria-hidden="true" />
        <h2 className="text-base">{title}</h2>
      </div>
      <p className="font-mono text-sm text-muted-foreground">
        <span className="text-destructive">err:</span> {messageOf(error)}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </section>
  );
}
