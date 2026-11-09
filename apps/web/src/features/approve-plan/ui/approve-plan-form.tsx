import { useQuery } from "@tanstack/react-query";

import { type Execution } from "@/entities/execution";
import { executionTasksQuery } from "@/entities/task";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { ApproveForm } from "./components/approve-form";

interface ApprovePlanFormProps {
  execution: Execution;
  onApproved: (execution: Execution) => void;
}

/**
 * US2-AS4/AS5: review the plan (every task with its planning fields, file conflicts) and start
 * it. Risky tasks need a tick each; permission bypass is off unless the phrase is typed.
 */
export function ApprovePlanForm({ execution, onApproved }: ApprovePlanFormProps) {
  const plan = useQuery(executionTasksQuery(execution.id));

  if (plan.isPending) return <LoadingState label="Loading the plan" rows={4} />;
  if (plan.isError) {
    return (
      <ErrorState title="Plan unavailable" error={plan.error} onRetry={() => void plan.refetch()} />
    );
  }
  if (plan.data.items.length === 0) {
    return (
      <EmptyState
        title="No plan yet"
        description="Generate a plan first — nothing runs until you approve it."
      />
    );
  }
  return <ApproveForm execution={execution} plan={plan.data} onApproved={onApproved} />;
}
