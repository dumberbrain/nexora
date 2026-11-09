import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { projectListQuery } from "@/entities/project";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";

import { RunFields } from "./components/run-fields";
import {
  RunWorkflowFormSchema,
  type RunWorkflowFormOutput,
  type RunWorkflowFormValues,
} from "../model/schemas";
import { useRunWorkflow } from "../model/use-workflow-mutations";

interface RunWorkflowDialogProps {
  workflowId: string;
  workflowName: string;
  version: number;
  /** the new execution (mode `workflow`) — navigate to its view */
  onStarted: (executionId: string) => void;
}

/** Run one version (any version — older ones stay runnable) inside a registered project. */
export function RunWorkflowDialog(props: RunWorkflowDialogProps) {
  const { workflowId, workflowName, version, onStarted } = props;
  const [open, setOpen] = useState(false);
  const projects = useQuery({ ...projectListQuery(), enabled: open });
  const run = useRunWorkflow(workflowId, version);
  const form = useForm<RunWorkflowFormValues, unknown, RunWorkflowFormOutput>({
    resolver: zodResolver(RunWorkflowFormSchema),
    defaultValues: { projectId: "", prompt: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = async (values: RunWorkflowFormOutput) => {
    try {
      const result = await run.mutateAsync(values);
      setOpen(false);
      onStarted(result.executionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Starting the run failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="rounded-sm">
          <PlayIcon aria-hidden="true" />
          Run version {version}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-sm sm:max-w-lg">
        <form noValidate onSubmit={(e) => void form.handleSubmit(submit)(e)}>
          <DialogHeader>
            <span className="text-index" aria-hidden="true">
              [run]
            </span>
            <DialogTitle className="text-display text-lg">
              Run {workflowName} v{version}
            </DialogTitle>
            <DialogDescription>
              Starts an execution in workflow mode inside the chosen project. Agent, skill and MCP
              nodes consume model usage.
            </DialogDescription>
          </DialogHeader>
          <RunFields projects={projects} register={form.register} errors={errors} />
          {errors.root?.server ? (
            <p role="alert" className="mb-3 font-mono text-xs text-destructive">
              {errors.root.server.message}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" className="rounded-sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" className="rounded-sm" disabled={isSubmitting}>
              {isSubmitting ? "Starting…" : "Start run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
