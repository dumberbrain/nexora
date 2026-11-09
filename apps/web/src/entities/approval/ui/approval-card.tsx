import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format-time";

import { type ApprovalRequest } from "../model/types";

interface ApprovalCardProps {
  approval: ApprovalRequest;
  /** risk tag rendered next to the action (composed by the caller) */
  tag?: ReactNode;
  /** decision controls (composed by the caller) */
  actions?: ReactNode;
  className?: string;
}

function detailsText(details: unknown): string | null {
  if (details === null || details === undefined) return null;
  if (typeof details === "string") return details;
  return JSON.stringify(details, null, 2);
}

/** One approval request: what is asked, for which task/agent, when; details are redacted. */
export function ApprovalCard({ approval, tag, actions, className }: ApprovalCardProps) {
  const details = detailsText(approval.details);
  const titleId = `approval-${approval.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cn("flex flex-col gap-2 border border-status-waiting/40 bg-card p-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="font-mono text-sm text-foreground normal-case">
          {approval.action}
        </h3>
        {tag}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 font-mono text-[11px]">
        {approval.taskId ? (
          <>
            <dt className="text-muted-foreground">task</dt>
            <dd>{approval.taskId}</dd>
          </>
        ) : null}
        {approval.agentId ? (
          <>
            <dt className="text-muted-foreground">agent</dt>
            <dd className="break-all">{approval.agentId}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">requested</dt>
        <dd>{formatDateTime(approval.createdAt)}</dd>
      </dl>
      {details ? (
        <pre className="max-h-32 overflow-auto border border-border bg-terminal p-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
          {details}
        </pre>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}
