import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { type GraphIssue, type WorkflowGraph } from "@/entities/workflow";
import { humanize } from "@/shared/lib/humanize";

interface IssuesListProps {
  issues: GraphIssue[];
  graph: WorkflowGraph;
  checking: boolean;
  /** the validate request failed — never claim the graph is valid then */
  failed: boolean;
  onSelect: (nodeId: string) => void;
}

/** Server validation result of the current draft; node issues jump to their node. */
export function IssuesList({ issues, graph, checking, failed, onSelect }: IssuesListProps) {
  const label = (ref: string | null) =>
    ref === null ? "graph" : (graph.nodes.find((n) => n.id === ref)?.label ?? ref);
  const isNode = (ref: string | null) => ref !== null && graph.nodes.some((n) => n.id === ref);

  return (
    <section aria-labelledby="wf-issues" className="flex flex-col gap-2" aria-busy={checking}>
      <h2 id="wf-issues" className="text-index font-mono text-[11px] tracking-widest uppercase">
        Validation issues
      </h2>
      {issues.length === 0 && failed && !checking ? (
        <p role="status" className="font-mono text-xs text-status-waiting">
          Validation unavailable — the server will check the graph on save.
        </p>
      ) : issues.length === 0 ? (
        <p
          role="status"
          className="flex items-center gap-1.5 font-mono text-xs text-status-completed"
        >
          <CircleCheckIcon className="size-3.5" aria-hidden="true" />
          {checking ? "Checking graph…" : "Graph is valid"}
        </p>
      ) : (
        <ul aria-label="Validation issues" className="flex flex-col gap-1.5">
          {issues.map((issue, i) => (
            <li
              key={`${issue.ref ?? "graph"}-${issue.code}-${i}`}
              className="flex items-start gap-1.5 font-mono text-xs text-destructive"
            >
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                {isNode(issue.ref) ? (
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline focus-visible:underline"
                    onClick={() => issue.ref && onSelect(issue.ref)}
                  >
                    {label(issue.ref)}
                  </button>
                ) : (
                  <span>{label(issue.ref)}</span>
                )}
                <span className="text-muted-foreground"> · {humanize(issue.code)} · </span>
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
