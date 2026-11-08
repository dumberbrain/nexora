import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { agentListQuery, AgentKindIcon } from "@/entities/agent";
import { StatusBadge, toStatusKind } from "@/entities/status";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { sessionAgentsFilters } from "../../model/load-session";

/** Agents of one session (main + subagents/teammates), each linking to its details. */
export function SessionAgents({ sessionId }: { sessionId: string }) {
  const agents = useQuery(agentListQuery(sessionAgentsFilters(sessionId)));

  if (agents.isPending) return <LoadingState label="Loading agents" rows={2} />;
  if (agents.isError) {
    return (
      <ErrorState
        title="Agents unavailable"
        error={agents.error}
        onRetry={() => void agents.refetch()}
      />
    );
  }
  if (agents.data.items.length === 0) {
    return (
      <EmptyState
        title="No agents yet"
        description="The main agent appears with the first hook event."
        className="py-6"
      />
    );
  }
  return (
    <ul
      aria-label="Session agents"
      className="flex flex-col divide-y divide-border border border-border bg-card"
    >
      {agents.data.items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 font-mono text-xs">
          <AgentKindIcon kind={a.kind} />
          <Link
            to="/agents/$agentId"
            params={{ agentId: a.id }}
            className="min-w-0 flex-1 truncate text-foreground hover:text-phosphor focus-visible:text-phosphor"
          >
            {a.name}
            {a.parentAgentId ? (
              <span className="text-muted-foreground">
                {" "}
                · child of {a.parentAgentId.slice(0, 8)}
              </span>
            ) : null}
          </Link>
          <span className="text-muted-foreground">task {a.currentTaskId ?? "none"}</span>
          <StatusBadge kind={toStatusKind(a.status)} />
        </li>
      ))}
    </ul>
  );
}
