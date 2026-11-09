import { useId, type ComponentProps } from "react";

import { type Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";

interface ProjectFieldProps extends Omit<ComponentProps<"select">, "id"> {
  projects: Project[];
  error?: string | undefined;
}

/** Native select of registered projects (keyboard + screen-reader friendly). */
export function ProjectField({ projects, error, className, ...select }: ProjectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        Project
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-9 rounded-sm border border-input bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        {...select}
      >
        <option value="">Select a project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.rootPath}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
