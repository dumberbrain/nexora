import { z } from "zod";

import { type NexoraEvent } from "./entities/event";
import { ExecutionModeSchema } from "./enums";
import { UlidSchema } from "./primitives";

/** Socket.IO namespace and path (contracts/socket-events.md). */
export const LIVE_NAMESPACE = "/live";
export const SOCKET_PATH = "/socket.io";
/** Max events replayed after reconnect before the client must refetch via REST. */
export const MAX_REPLAY_EVENTS = 5000;
/** Server batches `event` emissions per room on this interval. */
export const EVENT_BATCH_MS = 100;

export const SubscribeScopeSchema = z.enum(["global", "execution", "session", "agent"]);
export type SubscribeScope = z.infer<typeof SubscribeScopeSchema>;

export const SubscribePayloadSchema = z
  .object({
    scope: SubscribeScopeSchema,
    id: z.string().min(1).max(256).optional(),
    sinceEventId: UlidSchema.optional(),
  })
  .refine((p) => p.scope === "global" || p.id !== undefined, {
    message: "id is required unless scope is global",
    path: ["id"],
  });
export type SubscribePayload = z.infer<typeof SubscribePayloadSchema>;

export const SubscribeAckSchema = z.object({
  ok: z.boolean(),
  replayed: z.number().int().nonnegative(),
  /** true when more than MAX_REPLAY_EVENTS were missed — client refetches lists via REST */
  gap: z.boolean(),
  error: z.string().optional(),
});
export type SubscribeAck = z.infer<typeof SubscribeAckSchema>;

export const UnsubscribePayloadSchema = z.object({
  scope: SubscribeScopeSchema,
  id: z.string().min(1).max(256).optional(),
});
export type UnsubscribePayload = z.infer<typeof UnsubscribePayloadSchema>;

export const ENTITY_KINDS = [
  "execution",
  "task",
  "session",
  "agent",
  "approval",
  "workflowRun",
] as const;

export const EntityChangedSchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  id: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
});
export type EntityChanged = z.infer<typeof EntityChangedSchema>;

/** Overview counters (FR-024), throttled to ≤ 2/s. */
export const StatsSchema = z.object({
  activeSessions: z.number().int().nonnegative(),
  activeAgents: z.number().int().nonnegative(),
  idleAgents: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  failedTasks: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  runningWorkflows: z.number().int().nonnegative(),
  currentMode: ExecutionModeSchema.nullable(),
});
export type Stats = z.infer<typeof StatsSchema>;

export const ReplayDoneSchema = z.object({
  scope: SubscribeScopeSchema,
  id: z.string().optional(),
  lastEventId: UlidSchema.nullable(),
});
export type ReplayDone = z.infer<typeof ReplayDoneSchema>;

/** Batched `event` payload — one emission per room per EVENT_BATCH_MS. */
export type EventBatch = { events: NexoraEvent[] };

/** Typed Socket.IO maps shared by server (Server<…>) and client (Socket<…>). */
export interface ServerToClientEvents {
  event: (batch: EventBatch) => void;
  "entity.changed": (change: EntityChanged) => void;
  stats: (stats: Stats) => void;
  "replay.done": (done: ReplayDone) => void;
}

export interface ClientToServerEvents {
  subscribe: (payload: SubscribePayload, ack: (result: SubscribeAck) => void) => void;
  unsubscribe: (payload: UnsubscribePayload, ack: (result: { ok: boolean }) => void) => void;
}

/** Room name for a subscription scope. */
export function roomOf(scope: SubscribeScope, id?: string): string {
  return scope === "global" ? "global" : `${scope}:${id ?? ""}`;
}
