import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { defaultGraph, type WorkflowDetail } from "@/entities/workflow";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form/text-field";

import {
  CreateWorkflowFormSchema,
  type CreateWorkflowFormOutput,
  type CreateWorkflowFormValues,
} from "../model/schemas";
import { useCreateWorkflow } from "../model/use-workflow-mutations";

/** New workflow = definition + version 1 (start → end), then open it in the editor. */
export function CreateWorkflowForm({ onCreated }: { onCreated: (w: WorkflowDetail) => void }) {
  const create = useCreateWorkflow();
  const form = useForm<CreateWorkflowFormValues, unknown, CreateWorkflowFormOutput>({
    resolver: zodResolver(CreateWorkflowFormSchema),
    defaultValues: { name: "", description: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = async (values: CreateWorkflowFormOutput) => {
    try {
      onCreated(await create.mutateAsync({ ...values, graph: defaultGraph() }));
      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creating the workflow failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <form
      noValidate
      aria-label="Create workflow"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className="flex flex-col gap-3 border border-border p-4"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <TextField label="Name" error={errors.name?.message} {...form.register("name")} />
        <TextField
          label="Description"
          error={errors.description?.message}
          {...form.register("description")}
        />
      </div>
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" className="rounded-sm" disabled={isSubmitting}>
          <PlusIcon aria-hidden="true" />
          {isSubmitting ? "Creating…" : "Create workflow"}
        </Button>
      </div>
    </form>
  );
}
