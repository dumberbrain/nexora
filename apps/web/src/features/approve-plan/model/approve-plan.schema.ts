import { BYPASS_CONFIRMATION_PHRASE, TaskIdSchema } from "@nexora/contracts";
import { z } from "zod";

import { type ApproveExecutionInput } from "@/entities/execution";

/**
 * Approval form (FR-033 / FR-053): risky tasks are approved one by one (all unchecked by
 * default); permission bypass is off by default and needs the exact confirmation phrase.
 */
export const ApprovePlanFormSchema = z
  .object({
    approveRiskyTaskIds: z.array(TaskIdSchema),
    permissionBypass: z.boolean(),
    bypassConfirmation: z.string(),
  })
  .refine((v) => !v.permissionBypass || v.bypassConfirmation === BYPASS_CONFIRMATION_PHRASE, {
    message: `Type "${BYPASS_CONFIRMATION_PHRASE}" exactly to enable permission bypass`,
    path: ["bypassConfirmation"],
  });
export type ApprovePlanFormValues = z.infer<typeof ApprovePlanFormSchema>;

export const APPROVE_PLAN_DEFAULTS: ApprovePlanFormValues = {
  approveRiskyTaskIds: [],
  permissionBypass: false,
  bypassConfirmation: "",
};

/** Only send the phrase when bypass is actually requested. */
export function toApproveInput(values: ApprovePlanFormValues): ApproveExecutionInput {
  return values.permissionBypass
    ? {
        approveRiskyTaskIds: values.approveRiskyTaskIds,
        permissionBypass: true,
        bypassConfirmation: values.bypassConfirmation,
      }
    : { approveRiskyTaskIds: values.approveRiskyTaskIds, permissionBypass: false };
}
