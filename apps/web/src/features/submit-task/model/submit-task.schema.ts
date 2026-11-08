import { CreateExecutionInputSchema } from "@nexora/contracts";
import { z } from "zod";

/** Execution.prompt limit ("1–20 000 chars", PromptSchema). */
export const PROMPT_MAX = 20_000;

/**
 * Form shape = CreateExecutionInputSchema with user-facing messages; the contract schema still
 * validates the final value (ULID project id, trimmed 1–20 000 char prompt).
 */
export const SubmitTaskFormSchema = z.object({
  projectId: z
    .string()
    .min(1, "Choose a project")
    .pipe(CreateExecutionInputSchema.shape.projectId),
  prompt: z
    .string()
    .trim()
    .min(1, "Describe the task")
    .max(PROMPT_MAX, "At most 20 000 characters")
    .pipe(CreateExecutionInputSchema.shape.prompt),
});
export type SubmitTaskFormValues = z.input<typeof SubmitTaskFormSchema>;
export type SubmitTaskInput = z.output<typeof SubmitTaskFormSchema>;
