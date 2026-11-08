import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { EventTimeline } from "@/entities/event";
import { sessionDetailQuery } from "@/entities/session";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { SessionAgents } from "./components/session-agents";
import { SessionFacts } from "./components/session-facts";

/** One session: header facts, its agents, and a live event timeline (session room). */
export function SessionView({ sessionId }: { sessionId: string }) {
  const session = useQuery(sessionDetailQuery(sessionId));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="03"
        title={`Session ${sessionId.slice(0, 8)}`}
        description={<span className="font-mono text-xs break-all">{sessionId}</span>}
        actions={
          <Link
            to="/canvas"
            search={{ sessionId }}
            className="font-mono text-xs text-phosphor hover:underline"
          >
            open on canvas →
          </Link>
        }
      />
      {session.isPending ? <LoadingState label="Loading session" rows={3} /> : null}
      {session.isError ? (
        <ErrorState
          title="Session unavailable"
          error={session.error}
          onRetry={() => void session.refetch()}
        />
      ) : null}
      {session.data ? <SessionFacts session={session.data} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <section aria-labelledby="session-agents" className="flex flex-col gap-2">
          <h2 id="session-agents" className="text-sm tracking-widest">
            Agents
          </h2>
          <SessionAgents sessionId={sessionId} />
        </section>
        <section aria-labelledby="session-timeline" className="flex min-w-0 flex-col gap-2">
          <h2 id="session-timeline" className="text-sm tracking-widest">
            Live timeline
          </h2>
          <EventTimeline filters={{ sessionId }} label="Session events" />
        </section>
      </div>
    </div>
  );
}
