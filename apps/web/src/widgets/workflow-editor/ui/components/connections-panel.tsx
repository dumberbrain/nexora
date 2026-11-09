import { LinkIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { type WorkflowGraph, type WorkflowNode } from "@/entities/workflow";
import { Button } from "@/shared/ui/button";

import { LABEL_CLASS, SELECT_CLASS } from "./field-styles";
import { nextBranch } from "../../lib/graph-ops";
import { type WorkflowDraft } from "../../model/use-workflow-draft";

interface ConnectionsPanelProps {
  node: WorkflowNode;
  graph: WorkflowGraph;
  readOnly: boolean;
  draft: Pick<WorkflowDraft, "connect" | "removeEdge">;
}

/** Outgoing edges of the selected node + a keyboard way to connect it (no drag needed). */
export function ConnectionsPanel({ node, graph, readOnly, draft }: ConnectionsPanelProps) {
  const targetId = useId();
  const [target, setTarget] = useState("");
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const linked = new Set(outgoing.map((e) => e.target));
  const candidates = graph.nodes.filter(
    (n) => n.id !== node.id && n.kind !== "start" && !linked.has(n.id),
  );
  const branch = node.kind === "condition" ? nextBranch(graph, node.id) : undefined;
  const canAdd = node.kind !== "end" && branch !== null;

  return (
    <section aria-labelledby="wf-connections" className="flex flex-col gap-2">
      <h3 id="wf-connections" className={LABEL_CLASS}>
        Connections
      </h3>
      {outgoing.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No outgoing connections.</p>
      ) : (
        <ul aria-label={`Connections from ${node.label}`} className="flex flex-col gap-1">
          {outgoing.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 font-mono text-xs">
              <span>
                → {label(e.target)}
                {e.branch ? <span className="text-index"> (when {e.branch})</span> : null}
              </span>
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded-sm"
                  aria-label={`Remove connection to ${label(e.target)}`}
                  onClick={() => draft.removeEdge(e.id)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly || !canAdd ? null : (
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={targetId} className={LABEL_CLASS}>
              Connect to{branch ? ` (${branch} branch)` : ""}
            </label>
            <select
              id={targetId}
              className={SELECT_CLASS}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a node…</option>
              {candidates.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm"
            disabled={!target}
            onClick={() => {
              draft.connect(node.id, target, branch ?? undefined);
              setTarget("");
            }}
          >
            <LinkIcon aria-hidden="true" />
            Add connection
          </Button>
        </div>
      )}
    </section>
  );
}
