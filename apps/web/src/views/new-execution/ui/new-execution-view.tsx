import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { executionDetailQuery, isLaunched, type SetupStep } from "@/entities/execution";
import { ExecutionStatusBadge } from "@/entities/status";
import { SubmitTaskForm } from "@/features/submit-task";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { SetupStepBody } from "./components/setup-step";
import { WizardSteps } from "./components/wizard-steps";
import { type NewExecutionSearch } from "../model/new-execution-search";

interface NewExecutionViewProps {
  search: NewExecutionSearch;
  onSearchChange: (next: NewExecutionSearch) => void;
  onLaunched: (executionId: string) => void;
}

/**
 * US2 wizard: task → mode → questions → plan approval. The step lives in the URL so reloads and
 * back/forward keep the place; nothing runs before the final approval.
 */
export function NewExecutionView({ search, onSearchChange, onLaunched }: NewExecutionViewProps) {
  const { executionId } = search;
  const step: SetupStep = executionId ? search.step : "task";
  const execution = useQuery({
    ...executionDetailQuery(executionId ?? ""),
    enabled: executionId !== undefined,
  });

  const goTo = (next: SetupStep) =>
    onSearchChange(executionId ? { step: next, executionId } : { step: "task" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="04"
        title="New execution"
        description="Describe a task, pick how agents should work on it, review the plan — nothing runs until you approve it."
        actions={execution.data ? <ExecutionStatusBadge status={execution.data.status} /> : null}
      />
      <WizardSteps current={step} />
      {step === "task" ? (
        <SubmitTaskForm
          className="max-w-3xl"
          onSubmitted={(e) => onSearchChange({ step: "mode", executionId: e.id })}
        />
      ) : null}
      {step !== "task" && execution.isPending ? (
        <LoadingState label="Loading execution" rows={4} />
      ) : null}
      {step !== "task" && execution.isError ? (
        <ErrorState
          title="Execution unavailable"
          error={execution.error}
          onRetry={() => void execution.refetch()}
        />
      ) : null}
      {step !== "task" && execution.data && isLaunched(execution.data.status) ? (
        <EmptyState
          index="[>>]"
          title="This execution already started"
          description="Its plan was approved — follow its tasks live in the execution view."
          action={
            <Link
              to="/executions/$executionId"
              params={{ executionId: execution.data.id }}
              className="font-mono text-xs text-phosphor hover:underline"
            >
              open execution →
            </Link>
          }
        />
      ) : null}
      {step !== "task" && execution.data && !isLaunched(execution.data.status) ? (
        <SetupStepBody
          step={step}
          execution={execution.data}
          onStep={goTo}
          onLaunched={onLaunched}
        />
      ) : null}
    </div>
  );
}
