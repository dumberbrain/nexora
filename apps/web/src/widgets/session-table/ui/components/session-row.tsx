import { Link } from "@tanstack/react-router";
import { GitBranchIcon } from "lucide-react";

import {
  ObserveOnlyBadge,
  SessionIdChip,
  SessionModeLabel,
  StaleIndicator,
  sessionStaleReason,
  type Session,
} from "@/entities/session";
import { StatusBadge, toStatusKind } from "@/entities/status";
import { formatDateTime, formatRelative } from "@/shared/lib/format-time";
import { type ConnectionState } from "@/shared/socket/client";
import { UnavailableBadge } from "@/shared/ui/state";
import { TableCell, TableRow } from "@/shared/ui/table";

interface SessionRowProps {
  session: Session;
  now: number;
  connection: ConnectionState;
}

/** One FR-026 row: id, cwd, mode, model, current task, status, last activity, branch. */
export function SessionRow({ session, now, connection }: SessionRowProps) {
  const stale = sessionStaleReason(session, now, connection);
  return (
    <TableRow data-stale={stale !== null} className="font-mono text-xs">
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: session.id }}
            className="hover:text-phosphor focus-visible:text-phosphor"
          >
            <SessionIdChip id={session.id} />
          </Link>
          {session.observeOnly ? <ObserveOnlyBadge /> : null}
        </div>
      </TableCell>
      <TableCell className="max-w-64 truncate" title={session.cwd}>
        {session.cwd}
      </TableCell>
      <TableCell>
        <SessionModeLabel session={session} />
      </TableCell>
      <TableCell>
        {session.model ?? <UnavailableBadge reason="the runtime has not reported a model yet" />}
      </TableCell>
      <TableCell>
        <UnavailableBadge reason="the session payload does not include its current task" />
      </TableCell>
      <TableCell>
        <StatusBadge kind={toStatusKind(session.status)} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <time
            dateTime={new Date(session.lastActivityAt).toISOString()}
            title={formatDateTime(session.lastActivityAt)}
          >
            {formatRelative(session.lastActivityAt, now)}
          </time>
          <StaleIndicator reason={stale} />
        </div>
      </TableCell>
      <TableCell>
        {session.gitBranch ? (
          <span className="inline-flex items-center gap-1">
            <GitBranchIcon className="size-3 text-muted-foreground" aria-hidden="true" />
            {session.gitBranch}
          </span>
        ) : (
          <UnavailableBadge reason="not a git repository, or the branch could not be read" />
        )}
      </TableCell>
    </TableRow>
  );
}
