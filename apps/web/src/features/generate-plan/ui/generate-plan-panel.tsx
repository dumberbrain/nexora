import { ListChecksIcon } from "lucide-react";
import { useId, useState } from "react";

import { type GeneratePlanInput } from "@/entities/execution";
import { type ExecutionTasks } from "@/entities/task";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";

import { ModelUsageConsentDialog } from "./model-usage-consent-dialog";
import { isConsentRequired, useGeneratePlan } from "../model/use-generate-plan";

interface GeneratePlanPanelProps {
  executionId: string;
  projectName: string;
  onGenerated?: (tasks: ExecutionTasks) => void;
  className?: string;
}

/**
 * Generate the structured plan (FR-006). Local heuristic planning by default; model-assisted
 * planning is opt-in and, without a remembered consent, triggers the FR-008 consent dialog
 * (server 428) before it is retried with `consent: true`.
 */
export function GeneratePlanPanel({
  executionId,
  projectName,
  onGenerated,
  className,
}: GeneratePlanPanelProps) {
  const [modelAssisted, setModelAssisted] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const switchId = useId();
  const plan = useGeneratePlan(executionId);

  const run = (input: GeneratePlanInput) =>
    plan.mutate(input, {
      onSuccess: (tasks) => {
        setConsentOpen(false);
        onGenerated?.(tasks);
      },
      onError: (error) => {
        if (isConsentRequired(error)) setConsentOpen(true);
      },
    });

  const generate = () => run({ modelAssisted, consent: false, rememberConsentForProject: false });
  const confirm = (remember: boolean) =>
    run({ modelAssisted: true, consent: true, rememberConsentForProject: remember });
  const failed = plan.isError && !isConsentRequired(plan.error);

  return (
    <section
      aria-label="Generate plan"
      className={cn("flex flex-col gap-3 border border-border bg-card p-4", className)}
    >
      <div className="flex items-start gap-3">
        <Switch
          id={switchId}
          checked={modelAssisted}
          onCheckedChange={setModelAssisted}
          aria-describedby={`${switchId}-hint`}
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={switchId} className="font-mono text-xs uppercase">
            Model-assisted planning
          </label>
          <p id={`${switchId}-hint`} className="text-xs text-muted-foreground">
            Off: a local heuristic plan (no model usage). On: Claude drafts the plan — this consumes
            model usage and asks for your consent first.
          </p>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          Plan generation failed: {plan.error.message}
        </p>
      ) : null}
      <Button
        size="sm"
        className="self-start rounded-sm"
        disabled={plan.isPending}
        onClick={generate}
      >
        <ListChecksIcon aria-hidden="true" />
        {plan.isPending ? "Generating plan…" : "Generate plan"}
      </Button>
      <ModelUsageConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        purpose="plan generation"
        projectName={projectName}
        busy={plan.isPending}
        onConfirm={confirm}
      />
    </section>
  );
}
