import { z } from "zod";

import { AgentKindSchema, AgentStatusSchema } from "../enums";
import { TaskIdSchema } from "./task";

export const AgentSchema = z.object({
  /** session id for the main agent; Claude agent_id / tool_use id for subagents; name for teammates */
  id: z.string().min(1).max(256),
  sessionId: z.string().min(1),
  parentAgentId: z.string().nullable(),
  kind: AgentKindSchema,
  name: z.string().min(1).max(200),
  role: z.string().nullable(),
  definitionPath: z.string().nullable(),
  status: AgentStatusSchema,
  currentTaskId: TaskIdSchema.nullable(),
  /** completion report — user-visible output only, never hidden reasoning */
  summary: z.string().max(20_000).nullable(),
});
export type Agent = z.infer<typeof AgentSchema>;
