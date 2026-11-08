import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";

import { sessionListQuery, type SessionListFilters } from "@/entities/session";
import { useNow } from "@/shared/hooks/use-now";
import { useConnectionStore } from "@/shared/socket/client";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

import { SessionRow } from "./components/session-row";

const COLUMNS = [
  "Session",
  "Working directory",
  "Mode",
  "Model",
  "Current task",
  "Status",
  "Last activity",
  "Branch",
];

interface SessionTableProps {
  filters?: SessionListFilters;
  /** rendered instead of the default empty state (e.g. onboarding on the overview) */
  empty?: ReactNode;
  caption?: string;
}

/** Sessions list (FR-026), newest activity first; realtime changes arrive via the socket bridge. */
export function SessionTable({
  filters = {},
  empty,
  caption = "Claude Code sessions",
}: SessionTableProps) {
  const sessions = useQuery(sessionListQuery(filters));
  const connection = useConnectionStore((s) => s.state);
  const now = useNow();

  if (sessions.isPending) return <LoadingState label="Loading sessions" rows={4} />;
  if (sessions.isError) {
    return (
      <ErrorState
        title="Sessions unavailable"
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
      />
    );
  }
  if (sessions.data.items.length === 0) {
    return (
      empty ?? (
        <EmptyState
          title="No sessions observed yet"
          description="Sessions appear here as soon as Claude Code runs in a project with Nexora hooks installed."
        />
      )
    );
  }

  return (
    <div className="border border-border bg-card">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c} className="font-mono text-[10px] tracking-widest uppercase">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.data.items.map((s) => (
            <SessionRow key={s.id} session={s} now={now} connection={connection} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
