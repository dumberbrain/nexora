import { EXECUTION_MODES, STRATEGIES, type SetModeInput } from "@ubuliera/contracts";
import { z } from "zod";

import { type Execution, type ModeOption } from "@/entities/execution";

/** SetModeInputSchema with user-facing messages. */
export const ChooseModeFormSchema = z.object({
  mode: z.enum(EXECUTION_MODES.values, { error: "Choose an available mode" }),
  strategy: z.enum(STRATEGIES.values, { error: "Choose a strategy" }),
}) satisfies z.ZodType<SetModeInput>;
export type ChooseModeFormValues = z.infer<typeof ChooseModeFormSchema>;

/** Strategy preselected when the execution has none yet. */
export const DEFAULT_STRATEGY: SetModeInput["strategy"] = "plan_first";

/** Keep a previous valid choice; else the recommended available mode; else the first available. */
export function initialMode(
  execution: Pick<Execution, "mode">,
  options: readonly ModeOption[],
): SetModeInput["mode"] | undefined {
  const available = options.filter((o) => o.available);
  if (execution.mode && available.some((o) => o.mode === execution.mode)) return execution.mode;
  return (available.find((o) => o.recommended) ?? available[0])?.mode;
}
