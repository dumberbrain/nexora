import { type EventFilters, type NexoraEvent } from "../model/types";

/** API base the shared axios instance uses — export links are plain same-origin GETs. */
const API_BASE = "/api/v1";

/** Filters → query params in the server's wire format (arrays as comma lists). */
export function toEventParams(f: EventFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.executionId) p.executionId = f.executionId;
  if (f.sessionId) p.sessionId = f.sessionId;
  if (f.agentId) p.agentId = f.agentId;
  if (f.type?.length) p.type = f.type.join(",");
  if (f.severity?.length) p.severity = f.severity.join(",");
  if (f.mode) p.mode = f.mode;
  if (f.from !== undefined) p.from = String(f.from);
  if (f.to !== undefined) p.to = String(f.to);
  if (f.q) p.q = f.q;
  return p;
}

export type ExportFormat = "jsonl" | "csv";

/** GET /events/export URL for the current filters (cookie auth works for a download link). */
export function eventExportUrl(filters: EventFilters, format: ExportFormat): string {
  const qs = new URLSearchParams({ ...toEventParams(filters), format });
  return `${API_BASE}/events/export?${qs.toString()}`;
}

/**
 * Client-side mirror of the server filter, used to decide whether a live event belongs in the
 * current list. Events carry no execution mode, so a mode filter never matches live events —
 * those lists refresh from REST instead of guessing.
 */
export function matchesEventFilters(e: NexoraEvent, f: EventFilters): boolean {
  if (f.mode) return false;
  if (f.executionId && e.executionId !== f.executionId) return false;
  if (f.sessionId && e.sessionId !== f.sessionId) return false;
  if (f.agentId && e.agentId !== f.agentId) return false;
  if (f.type?.length && !f.type.includes(e.type)) return false;
  if (f.severity?.length && !f.severity.includes(e.severity)) return false;
  if (f.from !== undefined && e.ts < f.from) return false;
  if (f.to !== undefined && e.ts > f.to) return false;
  if (f.q && !e.summary.toLowerCase().includes(f.q.toLowerCase())) return false;
  return true;
}

/** Number of active filters — for "n filters" labels and clear buttons. */
export function countEventFilters(f: EventFilters): number {
  return Object.keys(toEventParams(f)).length;
}
