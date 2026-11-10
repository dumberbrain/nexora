import { CreateWorkflowInputSchema, RunWorkflowInputSchema } from "@ubuliera/contracts";
import { z } from "zod";

/** Run dialog = RunWorkflowInputSchema with user-facing messages. */
export const RunWorkflowFormSchema = z.object({
  projectId: z.string().min(1, "Choose a project").pipe(RunWorkflowInputSchema.shape.projectId),
  prompt: z.string().trim().max(20_000, "At most 20 000 characters"),
});
export type RunWorkflowFormValues = z.input<typeof RunWorkflowFormSchema>;
export type RunWorkflowFormOutput = z.output<typeof RunWorkflowFormSchema>;

/** Create form = CreateWorkflowInputSchema (without a graph) with user-facing messages. */
export const CreateWorkflowFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name the workflow")
    .max(120, "At most 120 characters")
    .pipe(CreateWorkflowInputSchema.shape.name),
  description: z.string().max(2000, "At most 2 000 characters"),
});
export type CreateWorkflowFormValues = z.input<typeof CreateWorkflowFormSchema>;
export type CreateWorkflowFormOutput = z.output<typeof CreateWorkflowFormSchema>;
