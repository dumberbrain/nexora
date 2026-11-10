import { cn } from "@/shared/lib/cn";

import { type EventSource, type EventType, type Reliability, type Severity } from "../model/types";

const TAG =
  "inline-flex items-center border px-1.5 py-px font-mono text-[10px] tracking-wider whitespace-nowrap uppercase";

function typeTone(type: EventType): string {
  if (type === "error" || type.endsWith(".failed"))
    return "border-status-failed/50 text-status-failed";
  if (type.startsWith("tool.")) return "border-status-completed/40 text-status-completed";
  if (type.startsWith("permission.") || type === "agent.waiting")
    return "border-status-waiting/50 text-status-waiting";
  if (type.startsWith("session.") || type.startsWith("agent."))
    return "border-phosphor/50 text-phosphor";
  return "border-border text-foreground";
}

/** Normalised event type, e.g. `tool.invoked`. */
export function EventTypeTag({ type, className }: { type: EventType; className?: string }) {
  return <span className={cn(TAG, "normal-case", typeTone(type), className)}>{type}</span>;
}

const RELIABILITY_HINT: Record<Reliability, string> = {
  authoritative: "reported by the runtime",
  derived: "inferred by Ubuliera from other events",
  best_effort: "polled from files — may lag or miss changes",
};

/** How much to trust an event: authoritative / derived / best effort (text, not colour alone). */
export function ReliabilityTag({
  reliability,
  className,
}: {
  reliability: Reliability;
  className?: string;
}) {
  return (
    <span
      title={RELIABILITY_HINT[reliability]}
      className={cn(
        TAG,
        reliability === "authoritative" && "border-phosphor/40 text-phosphor",
        reliability === "derived" &&
          "border-dashed border-status-completed/50 text-status-completed",
        reliability === "best_effort" && "border-dotted border-status-paused/60 text-status-paused",
        className,
      )}
    >
      {reliability.replace("_", " ")}
      <span className="sr-only">: {RELIABILITY_HINT[reliability]}</span>
    </span>
  );
}

/** Where the event came from (hook, stream_json, …). */
export function SourceTag({ source, className }: { source: EventSource; className?: string }) {
  return (
    <span className={cn(TAG, "border-border text-muted-foreground normal-case", className)}>
      <span className="sr-only">source </span>
      {source}
    </span>
  );
}

const SEVERITY_TONE: Record<Severity, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-status-paused",
  error: "text-status-failed",
};

/** Fixed-width severity label for log lines. */
export function SeverityTag({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block w-11 font-mono text-[10px] uppercase",
        SEVERITY_TONE[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}
