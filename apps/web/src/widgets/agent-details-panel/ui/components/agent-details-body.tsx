import { useQueryClient } from "@tanstack/react-query";

import { agentKeys, type AgentDetail } from "@/entities/agent";
import { EventTimeline } from "@/entities/event";
import { SessionControls } from "@/features/control-session";
import { SendMessageForm } from "@/features/send-message";

import { AgentIdentity } from "./agent-identity";
import { FilesChanged } from "./files-changed";
import { Section } from "./section";
import { UsageSummary } from "./usage-summary";

/** All FR-023 agent-details sections for a loaded agent. */
export function AgentDetailsBody({ detail }: { detail: AgentDetail }) {
  const qc = useQueryClient();
  const { agent } = detail;
  // live activity for this agent may change its status/children/files — refresh the wrapper
  const refresh = () => void qc.invalidateQueries({ queryKey: agentKeys.insight(agent.id) });

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
      <AgentIdentity detail={detail} />
      <Section index="00" title="Controls">
        {detail.session ? (
          <SessionControls session={detail.session} />
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            The agent&apos;s session is unknown — no controls available.
          </p>
        )}
        <SendMessageForm target={{ kind: "agent", agent, session: detail.session }} />
      </Section>
      <Section index="01" title="Output summary">
        {agent.summary ? (
          <p className="font-mono text-xs whitespace-pre-wrap text-foreground">{agent.summary}</p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            No completion report yet (reported when the agent finishes).
          </p>
        )}
      </Section>
      <Section index="02" title="Token usage & cost">
        <UsageSummary usage={detail.session?.usage ?? null} />
      </Section>
      <Section index="03" title="Files changed">
        <FilesChanged files={detail.filesChanged} />
      </Section>
      <Section index="04" title="Activity timeline">
        <EventTimeline
          filters={{ agentId: agent.id }}
          label="Agent activity"
          onLiveEvents={refresh}
        />
      </Section>
    </div>
  );
}
