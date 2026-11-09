import { useQuery } from "@tanstack/react-query";

import { executionModesQuery, type Execution } from "@/entities/execution";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { EnableAgentTeams } from "./components/enable-agent-teams";
import { ModeForm } from "./components/mode-form";

interface ChooseModeFormProps {
  execution: Execution;
  onChosen: (execution: Execution) => void;
}

/**
 * US2-AS2: modes for this task in this environment — recommended one marked with its reason,
 * unavailable ones disabled with why + how to enable. The form mounts once options are known so
 * the recommended mode is the initial value.
 */
export function ChooseModeForm({ execution, onChosen }: ChooseModeFormProps) {
  const modes = useQuery(executionModesQuery(execution.id));

  if (modes.isPending) return <LoadingState label="Loading execution modes" rows={3} />;
  if (modes.isError) {
    return (
      <ErrorState
        title="Modes unavailable"
        error={modes.error}
        onRetry={() => void modes.refetch()}
      />
    );
  }
  if (modes.data.length === 0) {
    return (
      <EmptyState
        title="No execution modes reported"
        description="The server did not report any execution mode for this environment."
      />
    );
  }
  const teams = modes.data.find((o) => o.mode === "agent_teams");
  return (
    <div className="flex flex-col gap-4">
      <ModeForm execution={execution} options={modes.data} onChosen={onChosen} />
      {teams && !teams.available ? <EnableAgentTeams execution={execution} /> : null}
    </div>
  );
}
