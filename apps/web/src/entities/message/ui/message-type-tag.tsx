import { cn } from "@/shared/lib/cn";

import { MESSAGE_TYPE_LABEL } from "../model/labels";
import { type MessageType } from "../model/types";

const TONE: Record<MessageType, string> = {
  instruction: "border-phosphor/50 text-phosphor",
  status: "border-border text-muted-foreground",
  question: "border-status-waiting/50 text-status-waiting",
  answer: "border-status-completed/40 text-status-completed",
  review_request: "border-status-paused/60 text-status-paused",
  result: "border-status-completed/40 text-status-completed",
};

/** Message type (text, not colour alone). */
export function MessageTypeTag({ type, className }: { type: MessageType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-px font-mono text-[10px] tracking-wider whitespace-nowrap uppercase",
        TONE[type],
        className,
      )}
    >
      {MESSAGE_TYPE_LABEL[type]}
    </span>
  );
}
