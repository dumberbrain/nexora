import { useQuery } from "@tanstack/react-query";

import { ApprovalCard, approvalListQuery } from "@/entities/approval";
import { RiskClassTag } from "@/entities/task";
import { DecideApprovalForm } from "@/features/decide-approval";
import { cn } from "@/shared/lib/cn";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { PENDING_APPROVALS } from "../model/pending";

interface ApprovalsInboxProps {
  /** only this execution's requests */
  executionId?: string;
  className?: string;
}

/** Pending approval requests with approve / reject (FR-033: no timeout ever auto-approves). */
export function ApprovalsInbox({ executionId, className }: ApprovalsInboxProps) {
  const approvals = useQuery(approvalListQuery(PENDING_APPROVALS));
  const items = (approvals.data?.items ?? []).filter(
    (a) => !executionId || a.executionId === executionId,
  );

  return (
    <section
      aria-labelledby="approvals-inbox"
      className={cn("flex flex-col gap-3 border border-border bg-card p-4", className)}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-index" aria-hidden="true">
          [!]
        </span>
        <h2 id="approvals-inbox" className="text-sm tracking-widest">
          Approvals inbox
        </h2>
        {approvals.data ? (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {items.length} pending
          </span>
        ) : null}
      </div>
      {approvals.isPending ? <LoadingState label="Loading approvals" rows={2} /> : null}
      {approvals.isError ? (
        <ErrorState
          title="Approvals unavailable"
          error={approvals.error}
          onRetry={() => void approvals.refetch()}
        />
      ) : null}
      {approvals.data && items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">Nothing waits for your approval.</p>
      ) : null}
      {items.map((a) => (
        <ApprovalCard
          key={a.id}
          approval={a}
          tag={<RiskClassTag risk={a.riskClass} />}
          actions={<DecideApprovalForm approval={a} />}
        />
      ))}
    </section>
  );
}
