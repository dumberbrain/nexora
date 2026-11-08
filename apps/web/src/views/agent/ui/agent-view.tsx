import { PageHeader } from "@/shared/ui/layout/page-header";
import { AgentCanvas } from "@/widgets/agent-canvas";
import { AgentDetailsPanel } from "@/widgets/agent-details-panel";

interface AgentViewProps {
  agentId: string;
  /** session of the agent — the canvas behind the panel shows that tree */
  sessionId: string;
  onClose: () => void;
}

/** Agent details (FR-023): the agent's session canvas with the details sheet open over it. */
export function AgentView({ agentId, sessionId, onClose }: AgentViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader index="02" title="Agent canvas" description="Details of the selected agent." />
      <AgentCanvas sessionId={sessionId} />
      <AgentDetailsPanel
        agentId={agentId}
        open
        onOpenChange={(open) => (open ? undefined : onClose())}
      />
    </div>
  );
}
