import { GitBranchIcon } from "lucide-react";

import {
  ObserveOnlyBadge,
  SessionModeLabel,
  StaleIndicator,
  sessionStaleReason,
  type Session,
} from "@/entities/session";
import { StatusBadge, toStatusKind } from "@/entities/status";
import { useNow } from "@/shared/hooks/use-now";
import { formatDateTime, formatRelative } from "@/shared/lib/format-time";
import { useConnectionStore } from "@/shared/socket/client";
import { UnavailableBadge } from "@/shared/ui/state";

const DT = "text-muted-foreground";

/** Session header facts (FR-026) incl. usage only when reported (FR-029). */
export function SessionFacts({ session }: { session: Session }) {
  const now = useNow();
  const connection = useConnectionStore((s) => s.state);
  const usage = session.usage;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 border border-border bg-card p-4 font-mono text-xs sm:grid-cols-[max-content_1fr_max-content_1fr]">
      <dt className={DT}>status</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <StatusBadge kind={toStatusKind(session.status)} />
        {session.observeOnly ? <ObserveOnlyBadge /> : null}
        <StaleIndicator reason={sessionStaleReason(session, now, connection)} />
      </dd>
      <dt className={DT}>last activity</dt>
      <dd title={formatDateTime(session.lastActivityAt)}>
        {formatRelative(session.lastActivityAt, now)}
      </dd>
      <dt className={DT}>cwd</dt>
      <dd className="break-all">{session.cwd}</dd>
      <dt className={DT}>branch</dt>
      <dd>
        {session.gitBranch ? (
          <span className="inline-flex items-center gap-1">
            <GitBranchIcon className="size-3" aria-hidden="true" />
            {session.gitBranch}
          </span>
        ) : (
          <UnavailableBadge reason="not a git repository, or the branch could not be read" />
        )}
      </dd>
      <dt className={DT}>mode</dt>
      <dd>
        <SessionModeLabel session={session} />
      </dd>
      <dt className={DT}>model</dt>
      <dd>
        {session.model ?? <UnavailableBadge reason="the runtime has not reported a model yet" />}
      </dd>
      <dt className={DT}>started</dt>
      <dd>{formatDateTime(session.startedAt)}</dd>
      <dt className={DT}>usage</dt>
      <dd>
        {usage ? (
          <span>
            {usage.inputTokens.toLocaleString("en-US")} in ·{" "}
            {usage.outputTokens.toLocaleString("en-US")} out
            {usage.costUsd !== null
              ? ` · $${usage.costUsd.toFixed(2)}${usage.costIsEstimate ? " (estimate)" : ""}`
              : ""}
          </span>
        ) : (
          <UnavailableBadge reason="runtime does not report usage" />
        )}
      </dd>
    </dl>
  );
}
