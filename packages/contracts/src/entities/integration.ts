import { z } from "zod";

import { EpochMsSchema, UlidSchema } from "../primitives";

export const IntegrationSchema = z.object({
  id: UlidSchema,
  projectId: UlidSchema.nullable(),
  kind: z.enum(["skill", "command", "agent_definition", "mcp_server", "github"]),
  name: z.string().min(1).max(200),
  scope: z.enum(["user", "project", "plugin"]),
  sourcePath: z.string().nullable(),
  /** skill/command usable as an executable workflow step (FR-014) */
  executable: z.boolean(),
  health: z.enum(["ok", "degraded", "down", "unknown"]),
  permissionStatus: z.enum(["allowed", "ask", "denied", "needs_auth"]),
  /** secrets stripped before this ever leaves the server */
  metadata: z.record(z.string(), z.unknown()),
  discoveredAt: EpochMsSchema,
});
export type Integration = z.infer<typeof IntegrationSchema>;
