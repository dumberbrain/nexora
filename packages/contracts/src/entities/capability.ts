import { z } from "zod";

import { EventTypeSchema, RuntimeKindSchema } from "../enums";

/**
 * What a runtime can actually do (contracts/runtime-adapter.md). UI controls are derived ONLY from
 * this profile (FR-016, FR-031) — an unsupported control is shown disabled with a reason.
 */
export const RuntimeCapabilityProfileSchema = z.object({
  runtime: RuntimeKindSchema,
  canStart: z.boolean(),
  canStop: z.boolean(),
  canInterrupt: z.boolean(),
  canPause: z.boolean(),
  canResume: z.boolean(),
  canRestart: z.boolean(),
  canSendMessage: z.enum(["yes", "lead_only", "no"]),
  canSetPermissionMode: z.boolean(),
  emitsEvents: z.array(EventTypeSchema),
  reportsUsage: z.enum(["exact", "estimate", "none"]),
  notes: z.array(z.string()),
});
export type RuntimeCapabilityProfile = z.infer<typeof RuntimeCapabilityProfileSchema>;
