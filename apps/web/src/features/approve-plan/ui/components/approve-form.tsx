import { zodResolver } from "@hookform/resolvers/zod";
import { PlayIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { type Execution } from "@/entities/execution";
import { riskyTasks, type ExecutionTasks } from "@/entities/task";
import { Button } from "@/shared/ui/button";

import { BypassSection } from "./bypass-section";
import { ConflictList } from "./conflict-list";
import { PlanTable } from "./plan-table";
import {
  APPROVE_PLAN_DEFAULTS,
  ApprovePlanFormSchema,
  toApproveInput,
  type ApprovePlanFormValues,
} from "../../model/approve-plan.schema";
import { useApprovePlan } from "../../model/use-approve-plan";

interface ApproveFormProps {
  execution: Execution;
  plan: ExecutionTasks;
  onApproved: (execution: Execution) => void;
}

/** Plan table + conflicts + bypass; POST /approve only on explicit submit. */
export function ApproveForm({ execution, plan, onApproved }: ApproveFormProps) {
  const form = useForm<ApprovePlanFormValues>({
    resolver: zodResolver(ApprovePlanFormSchema),
    defaultValues: APPROVE_PLAN_DEFAULTS,
  });
  const approve = useApprovePlan(execution.id);
  const [approved, bypass] = useWatch({
    control: form.control,
    name: ["approveRiskyTaskIds", "permissionBypass"],
  });
  const { errors, isSubmitting } = form.formState;
  const waiting = riskyTasks(plan.items).length - approved.length;

  const submit = async (values: ApprovePlanFormValues) => {
    try {
      onApproved(await approve.mutateAsync(toApproveInput(values)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approving the plan failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <form
      noValidate
      aria-label="Approve plan"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className="flex flex-col gap-4"
    >
      <ConflictList conflicts={plan.conflicts} />
      <PlanTable
        plan={plan}
        hybrid={execution.mode === "hybrid"}
        approveInput={form.register("approveRiskyTaskIds")}
      />
      {waiting > 0 ? (
        <p className="font-mono text-xs text-status-waiting">
          {waiting} risky task{waiting === 1 ? "" : "s"} will wait in the approvals inbox until
          approved — nothing risky runs on its own.
        </p>
      ) : null}
      <BypassSection
        enabled={bypass}
        onEnabledChange={(on) => {
          form.setValue("permissionBypass", on);
          if (!on) form.resetField("bypassConfirmation");
        }}
        confirmationInput={form.register("bypassConfirmation")}
        error={errors.bypassConfirmation?.message}
      />
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isSubmitting} className="self-start rounded-sm">
        <PlayIcon aria-hidden="true" />
        {isSubmitting ? "Starting…" : "Approve & start"}
      </Button>
    </form>
  );
}
