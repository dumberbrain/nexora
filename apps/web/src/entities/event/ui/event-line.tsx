import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { formatClock, formatDateTime } from "@/shared/lib/format-time";

import { EventTypeTag, ReliabilityTag, SeverityTag, SourceTag } from "./event-tags";
import { type UbulieraEvent } from "../model/types";

interface EventLineProps {
  event: UbulieraEvent;
  /** extra context rendered after the summary (e.g. session / agent links in the log viewer) */
  meta?: ReactNode;
  className?: string;
}

/** One terminal-style log line: time, severity, type, summary, source + reliability. */
export function EventLine({ event, meta, className }: EventLineProps) {
  return (
    <div
      data-severity={event.severity}
      className={cn(
        "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1 font-mono text-xs",
        event.severity === "error" && "bg-status-failed/5",
        className,
      )}
    >
      <time
        dateTime={new Date(event.ts).toISOString()}
        title={formatDateTime(event.ts)}
        className="shrink-0 text-muted-foreground tabular-nums"
      >
        {formatClock(event.ts)}
      </time>
      <SeverityTag severity={event.severity} />
      <EventTypeTag type={event.type} />
      <span className="min-w-0 flex-1 break-words text-foreground">
        {event.summary}
        {event.truncated ? (
          <span className="ms-1 text-muted-foreground">(payload truncated)</span>
        ) : null}
      </span>
      {meta}
      <span className="flex shrink-0 gap-1">
        <SourceTag source={event.source} />
        <ReliabilityTag reliability={event.reliability} />
      </span>
    </div>
  );
}
