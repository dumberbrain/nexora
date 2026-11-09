import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { executionListQuery } from "@/entities/execution";
import { projectListQuery } from "@/entities/project";
import { type TaskBoardFilters } from "@/entities/task";

const SELECT =
  "h-8 max-w-72 rounded-sm border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const LABEL = "font-mono text-[10px] tracking-widest uppercase";

interface BoardFiltersProps {
  filters: TaskBoardFilters;
  onChange: (next: TaskBoardFilters) => void;
}

/** Narrow the board to one project and/or one execution (URL search params). */
export function BoardFilters({ filters, onChange }: BoardFiltersProps) {
  const executionId = useId();
  const projectId = useId();
  const executions = useQuery(executionListQuery());
  const projects = useQuery(projectListQuery());
  const inProject = (executions.data?.items ?? []).filter(
    (e) => !filters.projectId || e.projectId === filters.projectId,
  );

  const setExecution = (value: string) => {
    const { executionId: _drop, ...rest } = filters;
    onChange(value ? { ...rest, executionId: value } : rest);
  };
  // a different project invalidates the chosen execution
  const setProject = (value: string) => onChange(value ? { projectId: value } : {});

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={projectId} className={LABEL}>
          Project
        </label>
        <select
          id={projectId}
          className={SELECT}
          value={filters.projectId ?? ""}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={executionId} className={LABEL}>
          Execution
        </label>
        <select
          id={executionId}
          className={SELECT}
          value={filters.executionId ?? ""}
          onChange={(e) => setExecution(e.target.value)}
        >
          <option value="">All executions</option>
          {inProject.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id.slice(-6)} · {e.prompt.length > 48 ? `${e.prompt.slice(0, 47)}…` : e.prompt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
