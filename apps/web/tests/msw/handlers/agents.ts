import {
  type Agent,
  type AgentDetail,
  type AgentList,
  type ApiErrorBody,
  type Message,
} from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

import { sentMessage, sessionFixtures } from "./sessions";

const S1 = "6f1c2a9e-1b7d-4a53-9f0e-2c4d8b7a1e01";
const S2 = "9a7b3c1d-2e4f-4a6b-8c0d-1e2f3a4b5c02";

export const agentFixtures: Agent[] = [
  {
    id: S1,
    sessionId: S1,
    parentAgentId: null,
    kind: "main",
    name: "main",
    role: null,
    definitionPath: null,
    status: "running",
    currentTaskId: "T-3",
    summary: null,
  },
  {
    id: "toolu_01AbCdEf",
    sessionId: S1,
    parentAgentId: S1,
    kind: "subagent",
    name: "code-reviewer",
    role: "Reviews diffs for correctness",
    definitionPath: ".claude/agents/code-reviewer.md",
    status: "running",
    currentTaskId: "T-4",
    summary: null,
  },
  {
    id: "toolu_02GhIjKl",
    sessionId: S1,
    parentAgentId: S1,
    kind: "subagent",
    name: "general-purpose",
    role: null,
    definitionPath: null,
    status: "completed",
    currentTaskId: null,
    summary: "Added the session table widget and its tests.",
  },
  {
    id: S2,
    sessionId: S2,
    parentAgentId: null,
    kind: "main",
    name: "main",
    role: null,
    definitionPath: null,
    status: "idle",
    currentTaskId: null,
    summary: null,
  },
];

const notFound: ApiErrorBody = { error: { code: "NOT_FOUND", message: "agent not found" } };

export const agentHandlers = [
  http.get("*/api/v1/agents", ({ request }) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const status = url.searchParams.get("status")?.split(",");
    const items = agentFixtures
      .filter((a) => !sessionId || a.sessionId === sessionId)
      .filter((a) => !status || status.includes(a.status));
    return HttpResponse.json<AgentList>({ items });
  }),
  http.get("*/api/v1/agents/:id", ({ params }) => {
    const agent = agentFixtures.find((a) => a.id === params.id);
    if (!agent) return HttpResponse.json(notFound, { status: 404 });
    return HttpResponse.json<AgentDetail>({
      agent,
      session: sessionFixtures.find((s) => s.id === agent.sessionId) ?? null,
      children: agentFixtures.filter((a) => a.parentAgentId === agent.id),
      filesChanged:
        agent.kind === "subagent" ? ["apps/web/src/widgets/session-table/index.ts"] : [],
    });
  }),
  http.post("*/api/v1/agents/:id/messages", async ({ params, request }) => {
    const agent = agentFixtures.find((a) => a.id === params.id);
    if (!agent) return HttpResponse.json(notFound, { status: 404 });
    const body = (await request.json()) as { text: string };
    return HttpResponse.json<Message>(
      sentMessage(body.text, { kind: "agent", agentId: agent.id }, null),
    );
  }),
];
