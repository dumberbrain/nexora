import { type UseQueryResult } from "@tanstack/react-query";
import { useId } from "react";
import { type FieldErrors, type UseFormRegister } from "react-hook-form";

import { type ProjectList } from "@/entities/project";
import { Textarea } from "@/shared/ui/textarea";

import { type RunWorkflowFormValues } from "../../model/schemas";

const LABEL = "font-mono text-[11px] tracking-widest text-muted-foreground uppercase";

interface RunFieldsProps {
  projects: UseQueryResult<ProjectList>;
  register: UseFormRegister<RunWorkflowFormValues>;
  errors: FieldErrors<RunWorkflowFormValues>;
}

/** Project select + optional context prompt of the run dialog. */
export function RunFields({ projects, register, errors }: RunFieldsProps) {
  const projectId = useId();
  const promptId = useId();
  const items = projects.data?.items ?? [];
  return (
    <div className="my-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={projectId} className={LABEL}>
          Project
        </label>
        <select
          id={projectId}
          aria-invalid={errors.projectId ? true : undefined}
          className="h-9 rounded-sm border border-input bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
          {...register("projectId")}
        >
          <option value="">{projects.isPending ? "Loading projects…" : "Select a project…"}</option>
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.rootPath}
            </option>
          ))}
        </select>
        {projects.isSuccess && items.length === 0 ? (
          <p className="font-mono text-xs text-status-waiting">
            No project registered — register one on the overview first.
          </p>
        ) : null}
        {projects.isError ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            Projects unavailable: {projects.error.message}
          </p>
        ) : null}
        {errors.projectId ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {errors.projectId.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={promptId} className={LABEL}>
          Prompt <span className="normal-case">(optional context for every node)</span>
        </label>
        <Textarea
          id={promptId}
          rows={4}
          aria-invalid={errors.prompt ? true : undefined}
          className="rounded-sm font-mono text-sm"
          {...register("prompt")}
        />
        {errors.prompt ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {errors.prompt.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
