import { useQueryClient } from "@tanstack/react-query";
import { type Session } from "@ubuliera/contracts";
import { type ReactNode } from "react";

import { agentKeys, type AgentDetail } from "@/entities/agent";
import { EventTimeline } from "@/entities/event";
import { SessionControls } from "@/features/control-session";
import { SendMessageForm } from "@/features/send-message";

import { AgentIdentity } from "./agent-identity";
import { FilesChanged } from "./files-changed";
import { Section } from "./section";
import { TeamOverview } from "./team-overview";
import { UsageSummary } from "./usage-summary";

interface AgentDetailsBodyProps {
  detail: AgentDetail;
  /** renders the interactive terminal of a Ubuliera-started Agent Teams lead (widgets/terminal) */
  leadTerminal?: ((session: Session) => ReactNode) | undefined;
}

const isTeamAgent = (kind: AgentDetail["agent"]["kind"]) =>
  kind === "team_lead" || kind === "teammate";

/** The lead PTY is only reachable for leads Ubuliera started itself (never observe-only). */
const leadSession = ({ agent, session }: AgentDetail): Session | null =>
  agent.kind === "team_lead" && session?.runtime === "agent_team_pty" && !session.observeOnly
    ? session
    : null;

/** All FR-023 agent-details sections for a loaded agent (+ the team for Agent Teams, US6). */
export function AgentDetailsBody({ detail, leadTerminal }: AgentDetailsBodyProps) {
  const qc = useQueryClient();
  const { agent, session } = detail;
  // live activity for this agent may change its status/children/files — refresh the wrapper
  const refresh = () => void qc.invalidateQueries({ queryKey: agentKeys.insight(agent.id) });
  const terminalSession = leadTerminal ? leadSession(detail) : null;
  // sections are numbered in display order; the US6 ones only exist for Agent Teams agents
  let n = 0;
  const index = () => String(n++).padStart(2, "0");

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
      <AgentIdentity detail={detail} />
      <Section index={index()} title="Controls">
        {detail.session ? (
          <SessionControls session={detail.session} />
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            The agent&apos;s session is unknown — no controls available.
          </p>
        )}
        <SendMessageForm target={{ kind: "agent", agent, session: detail.session }} />
      </Section>
      {leadTerminal && terminalSession ? (
        <Section index={index()} title="Lead terminal">
          {leadTerminal(terminalSession)}
        </Section>
      ) : null}
      {isTeamAgent(agent.kind) ? (
        <Section index={index()} title="Agent team">
          <TeamOverview sessionId={session?.id ?? agent.sessionId} />
        </Section>
      ) : null}
      <Section index={index()} title="Output summary">
        {agent.summary ? (
          <p className="font-mono text-xs whitespace-pre-wrap text-foreground">{agent.summary}</p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            No completion report yet (reported when the agent finishes).
          </p>
        )}
      </Section>
      <Section index={index()} title="Token usage & cost">
        <UsageSummary usage={detail.session?.usage ?? null} />
      </Section>
      <Section index={index()} title="Files changed">
        <FilesChanged files={detail.filesChanged} />
      </Section>
      <Section index={index()} title="Activity timeline">
        <EventTimeline
          filters={{ agentId: agent.id }}
          label="Agent activity"
          onLiveEvents={refresh}
        />
      </Section>
    </div>
  );
}
