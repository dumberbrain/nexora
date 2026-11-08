import { z } from "zod";

import { AbsolutePathSchema, EpochMsSchema, UlidSchema } from "../primitives";

export const DetectedStackSchema = z.object({
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManager: z.string().optional(),
  testRunners: z.array(z.string()),
});
export type DetectedStack = z.infer<typeof DetectedStackSchema>;

/** Project.name: "1–120 chars"; rootPath: "absolute, normalised" (normalised server-side). */
export const ProjectNameSchema = z.string().trim().min(1).max(120);

export const ProjectSchema = z.object({
  id: UlidSchema,
  name: ProjectNameSchema,
  rootPath: AbsolutePathSchema,
  detectedStack: DetectedStackSchema,
  instructionFiles: z.array(z.string()),
  hooksInstalled: z.boolean(),
  createdAt: EpochMsSchema,
  lastAnalyzedAt: EpochMsSchema.nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const RegisterProjectInputSchema = z.object({
  rootPath: AbsolutePathSchema,
  name: ProjectNameSchema.optional(),
});
export type RegisterProjectInput = z.infer<typeof RegisterProjectInputSchema>;
