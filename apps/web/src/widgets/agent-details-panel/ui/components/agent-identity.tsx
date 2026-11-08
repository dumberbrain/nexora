import { Link } from "@tanstack/react-router";

import { AgentKindIcon, type AgentDetail } from "@/entities/agent";
import { ObserveOnlyBadge, SessionIdChip } from "@/entities/session";
import { StatusBadge, toStatusKind } from "@/entities/status";

const DT = "text-muted-foreground";
const LINK = "hover:text-phosphor focus-visible:text-phosphor underline-offset-2 hover:underline";

/** Identity, role, assignment and parent/children links of one agent. */
export function AgentIdentity({ detail }: { detail: AgentDetail }) {
  const { agent, session, children } = detail;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 font-mono text-xs">
      <dt className={DT}>status</dt>
      <dd>
        <StatusBadge kind={toStatusKind(agent.status)} />
      </dd>
      <dt className={DT}>kind</dt>
      <dd>
        <AgentKindIcon kind={agent.kind} labelled />
      </dd>
      <dt className={DT}>id</dt>
      <dd className="break-all">{agent.id}</dd>
      <dt className={DT}>role</dt>
      <dd>{agent.role ?? <span className="text-muted-foreground">none declared</span>}</dd>
      {agent.definitionPath ? (
        <>
          <dt className={DT}>definition</dt>
          <dd className="break-all">{agent.definitionPath}</dd>
        </>
      ) : null}
      <dt className={DT}>task</dt>
      <dd>{agent.currentTaskId ?? <span className="text-muted-foreground">none assigned</span>}</dd>
      <dt className={DT}>session</dt>
      <dd className="flex flex-wrap items-center gap-1">
        <Link to="/sessions/$sessionId" params={{ sessionId: agent.sessionId }} className={LINK}>
          <SessionIdChip id={agent.sessionId} />
        </Link>
        {session?.observeOnly ? <ObserveOnlyBadge /> : null}
      </dd>
      <dt className={DT}>parent</dt>
      <dd>
        {agent.parentAgentId ? (
          <Link to="/agents/$agentId" params={{ agentId: agent.parentAgentId }} className={LINK}>
            {agent.parentAgentId}
          </Link>
        ) : (
          <span className="text-muted-foreground">root agent</span>
        )}
      </dd>
      <dt className={DT}>children</dt>
      <dd>
        {children.length === 0 ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {children.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Link to="/agents/$agentId" params={{ agentId: c.id }} className={LINK}>
                  {c.name}
                </Link>
                <StatusBadge kind={toStatusKind(c.status)} />
              </li>
            ))}
          </ul>
        )}
      </dd>
    </dl>
  );
}
