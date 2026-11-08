import {
  type EventType,
  type ExecutionMode,
  type NexoraEvent,
  type Page,
  type Severity,
} from "@nexora/contracts";

export type {
  EventSource,
  EventType,
  ExecutionMode,
  NexoraEvent,
  Page,
  Reliability,
  Severity,
} from "@nexora/contracts";

/** GET /events filters (contracts EventQuerySchema minus paging) — also the URL search shape. */
export type EventFilters = {
  executionId?: string;
  sessionId?: string;
  agentId?: string;
  type?: EventType[];
  severity?: Severity[];
  mode?: ExecutionMode;
  /** epoch ms, inclusive */
  from?: number;
  /** epoch ms, inclusive */
  to?: number;
  q?: string;
};

export type EventPage = Page<NexoraEvent>;
