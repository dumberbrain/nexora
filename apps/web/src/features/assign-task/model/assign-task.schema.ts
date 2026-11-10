import { type AssignTaskInput, AssignTaskInputSchema, RISK_CLASSES } from "@ubuliera/contracts";
import { z } from "zod";

const TASK_ID = /^T-[1-9]\d*$/;

const list = (sep: RegExp) => (v: string) =>
  v
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Form shape (plain strings for inputs) → AssignTaskInput. The contract schema validates the
 * final value; this layer adds user-facing messages and list parsing.
 */
export const AssignTaskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title").max(200, "At most 200 characters"),
    description: z.string().max(20_000, "At most 20 000 characters"),
    assignedAgentRole: z.string().trim().max(100, "At most 100 characters"),
    priority: z.enum(["p1", "p2", "p3"]),
    riskClass: z.enum(RISK_CLASSES.values),
    dependsOn: z
      .string()
      .transform(list(/[\s,]+/))
      .refine((ids) => ids.every((id) => TASK_ID.test(id)), "Task ids look like T-1, T-2"),
    ownedPaths: z.string().transform(list(/\r?\n/)),
  })
  .transform((v, ctx): AssignTaskInput => {
    // the contract validates the final value (pipe() is invariant on its `.default()` inputs)
    const parsed = AssignTaskInputSchema.safeParse({
      ...v,
      assignedAgentRole: v.assignedAgentRole || null,
    });
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
    return z.NEVER;
  });

export type AssignTaskFormValues = z.input<typeof AssignTaskFormSchema>;
export type AssignTaskValues = z.output<typeof AssignTaskFormSchema>;

export const ASSIGN_TASK_DEFAULTS: AssignTaskFormValues = {
  title: "",
  description: "",
  assignedAgentRole: "",
  priority: "p2",
  riskClass: "normal",
  dependsOn: "",
  ownedPaths: "",
};
