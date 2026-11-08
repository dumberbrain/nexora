import { cn } from "@/shared/lib/cn";

import { type Priority } from "../model/types";

const STYLE: Record<Priority, string> = {
  p1: "border-phosphor/60 text-phosphor",
  p2: "border-border text-foreground",
  p3: "border-dashed border-border text-muted-foreground",
};

const LABEL: Record<Priority, string> = { p1: "high", p2: "medium", p3: "low" };

/** Task priority: P1 (high) … P3 (low); the text label always accompanies the style. */
export function PriorityTag({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      title={`priority ${LABEL[priority]}`}
      className={cn(
        "inline-flex border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase",
        STYLE[priority],
        className,
      )}
    >
      {priority}
      <span className="sr-only"> ({LABEL[priority]} priority)</span>
    </span>
  );
}
