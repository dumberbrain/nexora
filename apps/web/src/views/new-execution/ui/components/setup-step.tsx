import { useQuery } from "@tanstack/react-query";

import { type Execution, type SetupStep } from "@/entities/execution";
import { projectListQuery } from "@/entities/project";
import { AnswerQuestionsForm } from "@/features/answer-questions";
import { ApprovePlanForm } from "@/features/approve-plan";
import { ChooseModeForm } from "@/features/choose-mode";
import { GeneratePlanPanel } from "@/features/generate-plan";
import { ModelConsentStatus } from "@/features/manage-model-consent";
import { AnalysisSummary } from "@/widgets/analysis-summary";

interface SetupStepProps {
  step: Exclude<SetupStep, "task">;
  execution: Execution;
  onStep: (step: SetupStep) => void;
  onLaunched: (executionId: string) => void;
}

/** Steps 2–4 of the wizard for an existing execution. */
export function SetupStepBody({ step, execution, onStep, onLaunched }: SetupStepProps) {
  const projects = useQuery(projectListQuery());
  const projectName =
    projects.data?.items.find((p) => p.id === execution.projectId)?.name ?? "this project";

  if (step === "mode") {
    return (
      <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
        <AnalysisSummary analysis={execution.analysis} />
        <ChooseModeForm execution={execution} onChosen={() => onStep("questions")} />
      </div>
    );
  }
  if (step === "questions") {
    return <AnswerQuestionsForm execution={execution} onSaved={() => onStep("plan")} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <GeneratePlanPanel executionId={execution.id} projectName={projectName} />
      <ModelConsentStatus
        project={{ id: execution.projectId, name: projectName }}
        className="-mt-2 px-1"
      />
      <ApprovePlanForm execution={execution} onApproved={(e) => onLaunched(e.id)} />
    </div>
  );
}
