import { Link } from "@tanstack/react-router";

import { type TaskBoardFilters } from "@/entities/task";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { KanbanBoard } from "@/widgets/kanban-board";

interface TasksViewProps {
  filters: TaskBoardFilters;
  onFiltersChange: (next: TaskBoardFilters) => void;
}

/** Task board page (US4). Filters live in the URL — shareable and back-button friendly. */
export function TasksView({ filters, onFiltersChange }: TasksViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        index="04"
        title="Task board"
        description="Every task by status, streaming live. Drag between Backlog and Todo to decide what runs next — agents move cards through the rest."
        actions={
          filters.executionId ? (
            <Link
              to="/executions/$executionId"
              params={{ executionId: filters.executionId }}
              className="font-mono text-xs text-phosphor hover:underline"
            >
              ← execution {filters.executionId.slice(-6)}
            </Link>
          ) : null
        }
      />
      <KanbanBoard filters={filters} onFiltersChange={onFiltersChange} />
    </div>
  );
}
