import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { projectListQuery } from "@/entities/project";

const SELECT =
  "h-8 max-w-72 rounded-sm border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface ProjectFilterProps {
  value: string | undefined;
  onChange: (projectId: string | undefined) => void;
}

/** "All projects" or one registered project (user-scope items show for every project). */
export function ProjectFilter({ value, onChange }: ProjectFilterProps) {
  const id = useId();
  const projects = useQuery(projectListQuery());
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-[10px] tracking-widest uppercase">
        Project
      </label>
      <select
        id={id}
        className={SELECT}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">All projects</option>
        {projects.data?.items.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
