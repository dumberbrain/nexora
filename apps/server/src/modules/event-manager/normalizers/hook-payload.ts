import { z } from "zod";

/**
 * Raw Claude Code hook body (S1 fixtures). Only the join keys are required; every other field is
 * read defensively because hook payloads differ per event and per Claude Code version.
 */
export const HookPayloadSchema = z.looseObject({
  session_id: z.string().min(1).max(128),
  hook_event_name: z.string().min(1).max(64),
  cwd: z.string().min(1).max(4096).optional(),
});
export type HookPayload = z.infer<typeof HookPayloadSchema>;

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === "object" && v !== null && !Array.isArray(v);

/** Non-empty string field or null. */
export function str(source: unknown, key: string): string | null {
  if (!isBag(source)) return null;
  const v = source[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Object field or an empty object. */
export function obj(source: unknown, key: string): Bag {
  if (!isBag(source)) return {};
  const v = source[key];
  return isBag(v) ? v : {};
}
