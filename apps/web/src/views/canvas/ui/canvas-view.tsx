import { PageHeader } from "@/shared/ui/layout/page-header";
import { AgentCanvas } from "@/widgets/agent-canvas";

import { SessionPicker } from "./session-picker";

interface CanvasViewProps {
  sessionId: string | undefined;
  onSessionChange: (sessionId: string | undefined) => void;
}

/** Agent Canvas page (FR-025). */
export function CanvasView({ sessionId, onSessionChange }: CanvasViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        index="02"
        title="Agent canvas"
        description="Main agents and the subagents they spawn. Nodes and links glow briefly when they report activity; click a node for details."
        actions={<SessionPicker value={sessionId} onChange={onSessionChange} />}
      />
      <AgentCanvas sessionId={sessionId} />
    </div>
  );
}
