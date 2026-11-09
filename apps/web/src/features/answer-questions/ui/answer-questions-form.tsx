import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon } from "lucide-react";

import { executionQuestionsQuery, type Execution } from "@/entities/execution";
import { Button } from "@/shared/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { QuestionsForm } from "./components/questions-form";

interface AnswerQuestionsFormProps {
  execution: Execution;
  onSaved: (execution: Execution) => void;
}

/**
 * US2-AS3 / FR-005: only the questions relevant to this task and mode, each pre-filled with its
 * recommended default. The form mounts after the questions load so defaults are initial values.
 */
export function AnswerQuestionsForm({ execution, onSaved }: AnswerQuestionsFormProps) {
  const questions = useQuery(executionQuestionsQuery(execution.id));

  if (questions.isPending) return <LoadingState label="Loading follow-up questions" rows={4} />;
  if (questions.isError) {
    return (
      <ErrorState
        title="Questions unavailable"
        error={questions.error}
        onRetry={() => void questions.refetch()}
      />
    );
  }
  if (questions.data.length === 0) {
    return (
      <EmptyState
        title="No follow-up questions"
        description="Nothing else is needed for this task and mode — the recommended configuration is used."
        action={
          <Button size="sm" className="rounded-sm" onClick={() => onSaved(execution)}>
            Continue
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        }
      />
    );
  }
  return <QuestionsForm execution={execution} questions={questions.data} onSaved={onSaved} />;
}
