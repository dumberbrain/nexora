import {
  type EventType,
  type ExecutionMode,
  type UbulieraEvent,
  type Page,
  type Severity,
} from "@ubuliera/contracts";

export type {
  EventSource,
  EventType,
  ExecutionMode,
  UbulieraEvent,
  Page,
  Reliability,
  Severity,
} from "@ubuliera/contracts";

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

export type EventPage = Page<UbulieraEvent>;
