import { useDraggable } from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { TaskStatusBadge } from "@/entities/status";
import { PriorityTag, type Task, taskCardId } from "@/entities/task";
import { dragBlockedReason } from "@/features/move-task";
import { cn } from "@/shared/lib/cn";

import { type CardDragData } from "../../model/announcements";

/**
 * One draggable card. The handle button is named "<id> <title>"; cards that cannot move
 * (anything outside Backlog/Todo) stay focusable with aria-disabled and the reason.
 */
export function TaskCard({ task }: { task: Task }) {
  const reasonId = useId();
  const blocked = dragBlockedReason(task);
  const data: CardDragData = { task };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: taskCardId(task), data, disabled: blocked !== null });

  return (
    <li
      ref={setNodeRef}
      data-board-card=""
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        "flex flex-col gap-2 border border-border bg-card p-2 font-mono text-xs",
        isDragging && "relative z-10 border-phosphor shadow-[0_0_0_1px_var(--phosphor)]",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        {...(blocked ? { "aria-describedby": reasonId } : {})}
        className={cn(
          "flex flex-col gap-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          blocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      >
        {/* name comes from the content (WCAG 2.5.3): "<id> <title> <status> …" */}
        <span className="text-sm leading-snug break-words text-foreground">
          <span className="text-phosphor">{task.id}</span> {task.title}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <TaskStatusBadge status={task.status} />
          <PriorityTag priority={task.priority} />
          <span>{task.assignedAgentRole ?? "unassigned"}</span>
          {task.attempt > 1 ? <span className="tabular-nums">attempt #{task.attempt}</span> : null}
        </span>
      </button>
      {blocked ? (
        <span id={reasonId} className="sr-only">
          {blocked}
        </span>
      ) : null}
      <Link
        to="/executions/$executionId"
        params={{ executionId: task.executionId }}
        className="self-start text-[10px] text-phosphor hover:underline"
      >
        exec {task.executionId.slice(-6)} →
      </Link>
    </li>
  );
}
