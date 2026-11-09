import { useDroppable } from "@dnd-kit/core";
import { useId } from "react";

import {
  BOARD_COLUMN_LABEL,
  type BoardColumn as Column,
  type Task,
  taskCardId,
} from "@/entities/task";
import { cn } from "@/shared/lib/cn";

import { TaskCard } from "./task-card";

/** While a card is dragged: where it may land (`allowed`), may not (`refused`), or came from. */
export type DropState = "allowed" | "refused" | "origin";

interface BoardColumnProps {
  column: Column;
  index: number;
  tasks: Task[];
  drop?: DropState | undefined;
}

const DROP_HINT: Record<DropState, string> = {
  allowed: "drop here",
  refused: "✕ refused",
  origin: "origin",
};

/** One droppable column: a region titled by the column, holding a list with the same name. */
export function BoardColumn({ column, index, tasks, drop }: BoardColumnProps) {
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const label = BOARD_COLUMN_LABEL[column];

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-board-column={index}
      data-drop={drop}
      className={cn(
        "flex min-h-64 flex-col gap-2 border border-border bg-terminal p-2 transition-colors",
        drop === "allowed" && "border-phosphor/60",
        drop === "allowed" && isOver && "bg-phosphor/10",
        drop === "refused" && "border-dashed border-status-failed/60 opacity-60",
        drop === "refused" && isOver && "cursor-not-allowed bg-status-failed/10",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 font-mono text-[10px] tracking-widest uppercase">
        <span className="flex items-baseline gap-1.5">
          <span className="text-index" aria-hidden="true">
            [{String(index + 1).padStart(2, "0")}]
          </span>
          <h2 id={headingId} className="text-foreground">
            {label}
          </h2>
          <span className="text-muted-foreground tabular-nums">{tasks.length}</span>
        </span>
        {drop ? (
          <span
            aria-hidden="true"
            className={drop === "refused" ? "text-status-failed" : "text-phosphor"}
          >
            {DROP_HINT[drop]}
          </span>
        ) : null}
      </header>
      <ul aria-label={label} className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskCard key={taskCardId(t)} task={t} />
        ))}
      </ul>
      {tasks.length === 0 ? (
        <p className="font-mono text-[10px] text-muted-foreground">— empty —</p>
      ) : null}
    </section>
  );
}
