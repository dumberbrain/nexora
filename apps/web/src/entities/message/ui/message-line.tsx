import { ArrowRightIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { formatClock, formatDateTime } from "@/shared/lib/format-time";

import { MessageTypeTag } from "./message-type-tag";
import { participantLabel } from "../lib/message-lib";
import { type Message, type Participant } from "../model/types";

function Who({ p, side }: { p: Participant; side: "from" | "to" }) {
  return (
    <span className={cn(p.kind === "agent" ? "text-phosphor" : "text-foreground")}>
      <span className="sr-only">{side === "from" ? "from " : "to "}</span>
      {participantLabel(p)}
    </span>
  );
}

/** One Communication Center line: time, sender → receiver, type, related task, summary. */
export function MessageLine({ message, className }: { message: Message; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1.5 font-mono text-xs",
        className,
      )}
    >
      <time
        dateTime={new Date(message.ts).toISOString()}
        title={formatDateTime(message.ts)}
        className="shrink-0 text-muted-foreground tabular-nums"
      >
        {formatClock(message.ts)}
      </time>
      <span className="inline-flex shrink-0 items-center gap-1">
        <Who p={message.from} side="from" />
        <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden="true" />
        <Who p={message.to} side="to" />
      </span>
      <MessageTypeTag type={message.type} />
      {message.taskId ? (
        <span className="shrink-0 border border-border px-1 text-[10px] text-muted-foreground">
          <span className="sr-only">task </span>
          {message.taskId}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 break-words text-foreground">{message.summary}</span>
    </div>
  );
}
