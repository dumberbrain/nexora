import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SendIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { type Execution } from "@/entities/execution";
import { projectListQuery } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { ProjectField } from "./components/project-field";
import { PromptField } from "./components/prompt-field";
import {
  SubmitTaskFormSchema,
  type SubmitTaskFormValues,
  type SubmitTaskInput,
} from "../model/submit-task.schema";
import { useSubmitTask } from "../model/use-submit-task";

interface SubmitTaskFormProps {
  onSubmitted: (execution: Execution) => void;
  defaultProjectId?: string | undefined;
  className?: string;
}

/**
 * FR-001: describe a task for a registered project. Submitting runs only the local heuristic
 * analysis (FR-008 — no model usage); nothing executes until the plan is approved.
 */
export function SubmitTaskForm({ onSubmitted, defaultProjectId, className }: SubmitTaskFormProps) {
  const projects = useQuery(projectListQuery());
  const form = useForm<SubmitTaskFormValues, unknown, SubmitTaskInput>({
    resolver: zodResolver(SubmitTaskFormSchema),
    defaultValues: { projectId: defaultProjectId ?? "", prompt: "" },
  });
  const prompt = useWatch({ control: form.control, name: "prompt" });
  const submitTask = useSubmitTask();
  const { errors, isSubmitting } = form.formState;

  if (projects.isPending) return <LoadingState label="Loading projects" rows={3} />;
  if (projects.isError) {
    return (
      <ErrorState
        title="Projects unavailable"
        error={projects.error}
        onRetry={() => void projects.refetch()}
      />
    );
  }
  if (projects.data.items.length === 0) {
    return (
      <EmptyState
        title="No project registered"
        description="Register a project folder on the overview first — tasks always run inside a registered project."
        action={
          <Link to="/" className="font-mono text-xs text-phosphor hover:underline">
            go to overview →
          </Link>
        }
      />
    );
  }

  const submit = async (values: SubmitTaskInput) => {
    try {
      onSubmitted(await submitTask.mutateAsync(values));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submitting the task failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <form
      noValidate
      aria-label="Submit task"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className={cn("flex flex-col gap-4", className)}
    >
      <ProjectField
        projects={projects.data.items}
        error={errors.projectId?.message}
        {...form.register("projectId")}
      />
      <PromptField
        length={prompt.length}
        error={errors.prompt?.message}
        placeholder="e.g. Build a SaaS app with auth, subscriptions, admin dashboard and payments"
        {...form.register("prompt")}
      />
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={isSubmitting} className="rounded-sm">
          <SendIcon aria-hidden="true" />
          {isSubmitting ? "Analysing…" : "Analyse task"}
        </Button>
        <p className="font-mono text-[11px] text-muted-foreground">
          local analysis only — no model usage, nothing runs yet
        </p>
      </div>
    </form>
  );
}
