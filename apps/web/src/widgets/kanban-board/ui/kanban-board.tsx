import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { BOARD_COLUMNS } from "@ubuliera/contracts";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  type BoardColumn as Column,
  groupByColumn,
  type Task,
  type TaskBoardFilters,
  taskBoardQuery,
} from "@/entities/task";
import { decideMove, useMoveTask } from "@/features/move-task";
import { cn } from "@/shared/lib/cn";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { BoardColumn, type DropState } from "./components/board-column";
import { BoardFilters } from "./components/board-filters";
import { columnKeyboardCoordinates } from "../lib/column-keyboard-coordinates";
import {
  BOARD_ANNOUNCEMENTS,
  columnOfOver,
  SCREEN_READER_INSTRUCTIONS,
  taskOfActive,
} from "../model/announcements";
import { useLiveBoard } from "../model/use-live-board";

interface KanbanBoardProps {
  filters: TaskBoardFilters;
  onFiltersChange: (next: TaskBoardFilters) => void;
  className?: string;
}

const DROP_OF = { move: "allowed", refused: "refused", same: "origin" } as const;

function dropState(task: Task | null, column: Column): DropState | undefined {
  return task ? DROP_OF[decideMove(task, column).kind] : undefined;
}

/**
 * US4 task board: six columns derived from status (`boardColumnOf`). Only Backlog ⇄ Todo drops
 * are accepted — optimistic, rolled back with the server's reason on 409. Pointer and keyboard
 * drag (Space, ←/→, Space) with screen-reader announcements; live via `task.*` events.
 */
export function KanbanBoard({ filters, onFiltersChange, className }: KanbanBoardProps) {
  const tasks = useQuery(taskBoardQuery(filters));
  useLiveBoard(filters);
  const move = useMoveTask(filters);
  const [dragged, setDragged] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );
  const columns = useMemo(() => groupByColumn(tasks.data?.items ?? []), [tasks.data]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const task = taskOfActive(active);
    const to = columnOfOver(over);
    if (!task || !to) return;
    const decision = decideMove(task, to);
    if (decision.kind === "refused")
      toast.warning("Move refused", { description: decision.reason });
    if (decision.kind === "move") move.mutate({ task, status: decision.status });
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <BoardFilters filters={filters} onChange={onFiltersChange} />
      {tasks.isPending ? <LoadingState label="Loading tasks" rows={4} /> : null}
      {tasks.isError ? (
        <ErrorState
          title="Tasks unavailable"
          error={tasks.error}
          onRetry={() => void tasks.refetch()}
        />
      ) : null}
      {tasks.data?.items.length === 0 ? (
        <EmptyState
          title="No tasks on this board"
          description="Tasks appear here once an execution's plan is generated. Try another execution or project filter."
        />
      ) : null}
      {tasks.data && tasks.data.items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: BOARD_ANNOUNCEMENTS,
            screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
          }}
          onDragStart={({ active }) => setDragged(taskOfActive(active) ?? null)}
          onDragCancel={() => setDragged(null)}
          onDragEnd={onDragEnd}
        >
          <section
            aria-label="Task board"
            className="grid auto-cols-[minmax(14rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
          >
            {BOARD_COLUMNS.map((c, i) => (
              <BoardColumn
                key={c}
                column={c}
                index={i}
                tasks={columns[c]}
                drop={dropState(dragged, c)}
              />
            ))}
          </section>
        </DndContext>
      ) : null}
    </div>
  );
}
