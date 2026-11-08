import { useQuery } from "@tanstack/react-query";

import { agentInsightQuery } from "@/entities/agent";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { AgentDetailsBody } from "./components/agent-details-body";

interface AgentDetailsPanelProps {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Agent Details (FR-023) as a side sheet: identity, status, usage, files, live timeline. */
export function AgentDetailsPanel({ agentId, open, onOpenChange }: AgentDetailsPanelProps) {
  const detail = useQuery({ ...agentInsightQuery(agentId), enabled: open });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-2 bg-terminal sm:max-w-xl">
        <SheetHeader>
          <span className="text-index" aria-hidden="true">
            [agent]
          </span>
          <SheetTitle className="text-display text-xl">
            {detail.data?.agent.name ?? "Agent details"}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            Live view of one agent — events are tagged with their source and reliability.
          </SheetDescription>
        </SheetHeader>
        {detail.isPending ? <LoadingState label="Loading agent" rows={6} className="px-4" /> : null}
        {detail.isError ? (
          <ErrorState
            title="Agent unavailable"
            error={detail.error}
            onRetry={() => void detail.refetch()}
            className="mx-4"
          />
        ) : null}
        {detail.data ? <AgentDetailsBody detail={detail.data} /> : null}
      </SheetContent>
    </Sheet>
  );
}
