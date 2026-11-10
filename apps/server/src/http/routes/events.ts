import {
  type EventExportQuery,
  EventExportQuerySchema,
  EventQuerySchema,
  MAX_EXPORT_ROWS,
  type UbulieraEvent,
  type Page,
  type Stats,
} from "@ubuliera/contracts";
import { type Hono } from "hono";

import { csvRow } from "../../lib/csv";
import { type EventStore } from "../../modules/event-manager";
import { type StatsService } from "../../modules/event-manager/stats.service";
import { type AppBindings } from "../context";

const CSV_COLUMNS = [
  "id",
  "ts",
  "type",
  "source",
  "reliability",
  "severity",
  "executionId",
  "sessionId",
  "agentId",
  "taskId",
  "summary",
] as const satisfies readonly (keyof UbulieraEvent)[];

const EXPORT_PAGE = 500;

function serialize(format: EventExportQuery["format"], e: UbulieraEvent): string {
  return format === "csv" ? csvRow(CSV_COLUMNS.map((k) => e[k])) : `${JSON.stringify(e)}\n`;
}

/**
 * Pull-based stream (back-pressure aware): pages newest → oldest through EventStore.list until
 * the filters are exhausted or MAX_EXPORT_ROWS is reached. Stored events are already redacted.
 */
function exportStream(store: EventStore, q: EventExportQuery): ReadableStream<Uint8Array> {
  const { format, ...filters } = q;
  const encoder = new TextEncoder();
  let cursor: string | undefined;
  let sent = 0;
  let started = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      let chunk = "";
      if (!started && format === "csv") chunk += csvRow(CSV_COLUMNS);
      started = true;
      const page = store.list({
        ...filters,
        limit: Math.min(EXPORT_PAGE, MAX_EXPORT_ROWS - sent),
        ...(cursor === undefined ? {} : { cursor }),
      });
      for (const e of page.items) chunk += serialize(format, e);
      sent += page.items.length;
      cursor = page.nextCursor ?? undefined;
      if (chunk) controller.enqueue(encoder.encode(chunk));
      if (cursor === undefined || sent >= MAX_EXPORT_ROWS) controller.close();
    },
  });
}

/** GET /events, GET /events/export, GET /stats (T060, T061). */
export function registerEventRoutes(
  api: Hono<AppBindings>,
  deps: { store: EventStore; stats: StatsService },
): void {
  api.get("/events", (c) => {
    const q = EventQuerySchema.parse(c.req.query());
    return c.json<Page<UbulieraEvent>>(deps.store.list(q));
  });

  api.get("/events/export", (c) => {
    const q = EventExportQuerySchema.parse(c.req.query());
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return c.body(exportStream(deps.store, q), 200, {
      "content-type":
        q.format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="ubuliera-events-${stamp}.${q.format}"`,
      "cache-control": "no-store",
    });
  });

  api.get("/stats", (c) => c.json<Stats>(deps.stats.current()));
}
