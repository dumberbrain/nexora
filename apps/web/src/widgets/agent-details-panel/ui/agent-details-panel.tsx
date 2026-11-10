import { useQuery } from "@tanstack/react-query";
import { type Session } from "@ubuliera/contracts";
import { type ReactNode } from "react";

import { agentInsightQuery } from "@/entities/agent";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { AgentDetailsBody } from "./components/agent-details-body";

interface AgentDetailsPanelProps {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Slot for the Agent Teams lead terminal (US6). Widgets do not import each other, so the view
   * passes `(session) => <TeamLeadTerminal session={session} />` from widgets/terminal.
   */
  leadTerminal?: ((session: Session) => ReactNode) | undefined;
}

/** Agent Details (FR-023) as a side sheet: identity, status, usage, files, live timeline. */
export function AgentDetailsPanel({
  agentId,
  open,
  onOpenChange,
  leadTerminal,
}: AgentDetailsPanelProps) {
  const detail = useQuery({ ...agentInsightQuery(agentId), enabled: open });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-2 bg-terminal sm:max-w-xl"
        // Esc typed into the lead terminal belongs to Claude Code, not to this sheet
        onEscapeKeyDown={(e) => {
          if (e.target instanceof Element && e.target.closest("[data-terminal]")) {
            e.preventDefault();
          }
        }}
      >
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
        {detail.data ? <AgentDetailsBody detail={detail.data} leadTerminal={leadTerminal} /> : null}
      </SheetContent>
    </Sheet>
  );
}
