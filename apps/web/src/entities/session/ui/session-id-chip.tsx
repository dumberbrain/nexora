import { cn } from "@/shared/lib/cn";

interface SessionIdChipProps {
  id: string;
  className?: string;
}

/** Shortened Claude Code session UUID; the full id stays available to hover and screen readers. */
export function SessionIdChip({ id, className }: SessionIdChipProps) {
  const short = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return (
    <span
      title={id}
      className={cn(
        "inline-flex border border-border bg-terminal px-1.5 py-0.5 font-mono text-xs text-foreground",
        className,
      )}
    >
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">session {id}</span>
    </span>
  );
}
