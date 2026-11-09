import { SaveIcon } from "lucide-react";

import {
  graphIssuesFromError,
  type WorkflowGraph,
  type WorkflowVersion,
} from "@/entities/workflow";
import { Button } from "@/shared/ui/button";

import { useSaveVersion } from "../model/use-workflow-mutations";

interface SaveVersionButtonProps {
  workflowId: string;
  graph: WorkflowGraph;
  /** nothing to save (no edits) */
  disabled?: boolean;
  onSaved: (version: WorkflowVersion) => void;
}

/** Versions are immutable: saving always creates version n+1 (`onSaved` gets its number). */
export function SaveVersionButton({
  workflowId,
  graph,
  disabled,
  onSaved,
}: SaveVersionButtonProps) {
  const save = useSaveVersion(workflowId);
  const issues = graphIssuesFromError(save.error);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        className="rounded-sm"
        disabled={disabled || save.isPending}
        onClick={() => save.mutate(graph, { onSuccess: (saved) => onSaved(saved) })}
      >
        <SaveIcon aria-hidden="true" />
        {save.isPending ? "Saving…" : "Save as new version"}
      </Button>
      {save.isError ? (
        <div role="alert" className="font-mono text-xs text-destructive">
          <p>Not saved: {save.error.message}</p>
          {issues.length > 0 ? (
            <ul className="list-inside list-disc">
              {issues.map((i, n) => (
                <li key={`${i.ref ?? "graph"}-${n}`}>{i.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
