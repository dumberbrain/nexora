import { type Message, type MessageList } from "@nexora/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const X002 = "01JCXK0000000000000000X002";

/** Communication Center feed, newest first (server order). */
export const messageFixtures: Message[] = [
  {
    id: "01JCXK0000000000000000M003",
    executionId: X002,
    taskId: "T-2",
    from: { kind: "agent", agentId: "backend-dev" },
    to: { kind: "coordinator" },
    type: "question",
    summary: "Should the legacy settings table be dropped or archived?",
    ts: NOW - 20_000,
  },
  {
    id: "01JCXK0000000000000000M002",
    executionId: X002,
    taskId: "T-1",
    from: { kind: "coordinator" },
    to: { kind: "agent", agentId: "frontend-dev" },
    type: "instruction",
    summary: "Implement the theme store with a persisted preference.",
    ts: NOW - 60_000,
  },
  {
    id: "01JCXK0000000000000000M001",
    executionId: X002,
    taskId: null,
    from: { kind: "user" },
    to: { kind: "coordinator" },
    type: "status",
    summary: "Execution approved; starting 3 tasks.",
    ts: NOW - 120_000,
  },
];

export const messageHandlers = [
  http.get("*/api/v1/messages", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const executionId = q.get("executionId");
    const taskId = q.get("taskId");
    const type = q.get("type");
    const items = messageFixtures
      .filter((m) => !executionId || m.executionId === executionId)
      .filter((m) => !taskId || m.taskId === taskId)
      .filter((m) => !type || m.type === type);
    return HttpResponse.json<MessageList>({ items, nextCursor: null });
  }),
];
