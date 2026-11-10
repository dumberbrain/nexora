import { type UbulieraEvent, type Page } from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const S1 = "6f1c2a9e-1b7d-4a53-9f0e-2c4d8b7a1e01";

type EventFixtureInput = Pick<UbulieraEvent, "id" | "type" | "summary"> & Partial<UbulieraEvent>;

/** Event fixture with hook-sourced defaults. */
export function makeEvent(p: EventFixtureInput): UbulieraEvent {
  return {
    ts: NOW,
    source: "hook",
    reliability: "authoritative",
    severity: "info",
    executionId: null,
    sessionId: S1,
    agentId: S1,
    taskId: null,
    payload: {},
    truncated: false,
    ...p,
  };
}

/** Ids are ULIDs, so lexical order == time order. Stored oldest first. */
export const eventFixtures: UbulieraEvent[] = [
  makeEvent({
    id: "01JCXK00000000000000000E01",
    ts: NOW - 60_000,
    type: "session.started",
    summary: "Session started in C:/work/ubuliera",
  }),
  makeEvent({
    id: "01JCXK00000000000000000E02",
    ts: NOW - 50_000,
    type: "tool.invoked",
    summary: "Bash: npm test",
  }),
  makeEvent({
    id: "01JCXK00000000000000000E03",
    ts: NOW - 45_000,
    type: "tool.completed",
    summary: "Bash finished (exit 0)",
  }),
  makeEvent({
    id: "01JCXK00000000000000000E04",
    ts: NOW - 40_000,
    type: "agent.spawned",
    summary: "Subagent code-reviewer started",
    agentId: "toolu_01AbCdEf",
  }),
  makeEvent({
    id: "01JCXK00000000000000000E05",
    ts: NOW - 30_000,
    type: "file.modified",
    summary: "Edited apps/web/src/widgets/session-table/index.ts",
    reliability: "derived",
    agentId: "toolu_01AbCdEf",
  }),
  makeEvent({
    id: "01JCXK00000000000000000E06",
    ts: NOW - 20_000,
    type: "error",
    severity: "error",
    summary: "Tool Read failed: ENOENT",
    agentId: "toolu_01AbCdEf",
  }),
];

export const eventHandlers = [
  http.get("*/api/v1/events", ({ request }) => {
    const sp = new URL(request.url).searchParams;
    const list = (k: string) => sp.get(k)?.split(",");
    const types = list("type");
    const severities = list("severity");
    const q = sp.get("q")?.toLowerCase();
    const cursor = sp.get("cursor");
    const limit = Number(sp.get("limit") ?? 50);
    const matching = eventFixtures
      .filter((e) => !sp.get("executionId") || e.executionId === sp.get("executionId"))
      .filter((e) => !sp.get("sessionId") || e.sessionId === sp.get("sessionId"))
      .filter((e) => !sp.get("agentId") || e.agentId === sp.get("agentId"))
      .filter((e) => !types || types.includes(e.type))
      .filter((e) => !severities || severities.includes(e.severity))
      .filter((e) => !q || e.summary.toLowerCase().includes(q))
      .filter((e) => !cursor || e.id < cursor)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    const items = matching.slice(0, limit);
    const nextCursor = matching.length > limit ? (items.at(-1)?.id ?? null) : null;
    return HttpResponse.json<Page<UbulieraEvent>>({ items, nextCursor });
  }),
];
