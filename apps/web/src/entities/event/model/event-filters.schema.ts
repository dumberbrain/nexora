import { EventTypeSchema, ExecutionModeSchema, SeveritySchema } from "@ubuliera/contracts";
import { z } from "zod";

/** The router's JSON search parser turns "123" into a number — accept both for text ids. */
const text = (max: number) =>
  z
    .preprocess(
      (v) => (typeof v === "number" ? String(v) : v),
      z.string().trim().min(1).max(max).optional(),
    )
    .catch(undefined);

const list = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((v) => (typeof v === "string" ? [v] : v), z.array(item).min(1).optional())
    .catch(undefined);

const epoch = z.number().int().nonnegative().optional().catch(undefined);

/**
 * URL search params of the Live Logs page (validateSearch). Invalid values are dropped, never
 * thrown, so a hand-edited URL still opens the page.
 */
export const EventFiltersSchema = z.object({
  executionId: text(64),
  sessionId: text(128),
  agentId: text(256),
  type: list(EventTypeSchema),
  severity: list(SeveritySchema),
  mode: ExecutionModeSchema.optional().catch(undefined),
  from: epoch,
  to: epoch,
  q: text(200),
});
