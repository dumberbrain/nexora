import { zodResolver } from "@hookform/resolvers/zod";
import { RISK_CLASSES } from "@nexora/contracts";
import { ListPlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { type Task } from "@/entities/task";
import { cn } from "@/shared/lib/cn";
import { humanize } from "@/shared/lib/humanize";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form/text-field";

import { SelectField, TextAreaField } from "./components/fields";
import {
  ASSIGN_TASK_DEFAULTS,
  AssignTaskFormSchema,
  type AssignTaskFormValues,
  type AssignTaskValues,
} from "../model/assign-task.schema";
import { useAssignTask } from "../model/use-assign-task";

const PRIORITIES = [
  { value: "p1", label: "P1 — highest" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3 — lowest" },
] as const;
const RISKS = RISK_CLASSES.values.map((r) => ({ value: r, label: humanize(r) }));

interface AssignTaskFormProps {
  executionId: string;
  onAssigned?: (task: Task) => void;
  className?: string;
}

/** Assign an additional task to a running execution (AssignTaskInput, US3). */
export function AssignTaskForm({ executionId, onAssigned, className }: AssignTaskFormProps) {
  const assign = useAssignTask(executionId);
  const form = useForm<AssignTaskFormValues, unknown, AssignTaskValues>({
    resolver: zodResolver(AssignTaskFormSchema),
    defaultValues: ASSIGN_TASK_DEFAULTS,
  });
  const { errors, isSubmitting } = form.formState;
  const submit = async (values: AssignTaskValues) => {
    try {
      const task = await assign.mutateAsync(values);
      form.reset(ASSIGN_TASK_DEFAULTS);
      onAssigned?.(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assigning the task failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <form
      noValidate
      aria-label="Assign task"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className={cn("grid gap-3 sm:grid-cols-2", className)}
    >
      <TextField
        label="Title"
        error={errors.title?.message}
        className="sm:col-span-2"
        {...form.register("title")}
      />
      <TextAreaField
        label="Description"
        error={errors.description?.message}
        className="sm:col-span-2"
        {...form.register("description")}
      />
      <TextField
        label="Agent role"
        hint="Optional — e.g. QA Engineer"
        error={errors.assignedAgentRole?.message}
        {...form.register("assignedAgentRole")}
      />
      <TextField
        label="Depends on"
        hint="Task ids, comma separated"
        error={errors.dependsOn?.message}
        {...form.register("dependsOn")}
      />
      <SelectField label="Priority" options={PRIORITIES} {...form.register("priority")} />
      <SelectField label="Risk class" options={RISKS} {...form.register("riskClass")} />
      <TextAreaField
        label="Owned paths"
        hint="One glob per line; empty means the whole project (conflicts with every parallel task)"
        error={errors.ownedPaths?.message}
        className="sm:col-span-2"
        {...form.register("ownedPaths")}
      />
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive sm:col-span-2">
          {errors.root.server.message}
        </p>
      ) : null}
      <Button
        type="submit"
        size="sm"
        disabled={isSubmitting}
        className="justify-self-start rounded-sm"
      >
        <ListPlusIcon aria-hidden="true" />
        {isSubmitting ? "Assigning…" : "Assign task"}
      </Button>
    </form>
  );
}
