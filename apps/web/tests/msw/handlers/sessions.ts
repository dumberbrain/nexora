import {
  type ApiErrorBody,
  type Message,
  type RuntimeCapabilityProfile,
  type Session,
  type SessionDetail,
  type SessionList,
  type SessionStatus,
} from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

import { agentFixtures } from "./agents";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

/** Capability profile of a session Ubuliera only observes through hooks. */
export const observedCapabilities: RuntimeCapabilityProfile = {
  runtime: "external_observed",
  canStart: false,
  canStop: false,
  canInterrupt: false,
  canPause: false,
  canResume: false,
  canRestart: false,
  canSendMessage: "no",
  canSetPermissionMode: false,
  emitsEvents: ["tool.invoked", "tool.completed", "agent.spawned", "agent.completed"],
  reportsUsage: "none",
  notes: ["observed via http hooks"],
};

const base: Omit<Session, "id" | "status" | "lastActivityAt" | "startedAt"> = {
  executionId: null,
  executionMode: null,
  currentTaskId: null,
  projectId: "01JCXK0000000000000000P001",
  runtime: "external_observed",
  observeOnly: true,
  cwd: "C:/work/ubuliera",
  gitBranch: "feat/us1-web",
  worktreePath: null,
  model: "claude-opus-4-5",
  capabilities: observedCapabilities,
  pid: null,
  usage: null,
  endedAt: null,
};

export const sessionFixtures: Session[] = [
  {
    ...base,
    id: "6f1c2a9e-1b7d-4a53-9f0e-2c4d8b7a1e01",
    status: "running",
    lastActivityAt: NOW - 20_000,
    startedAt: NOW - 900_000,
  },
  {
    ...base,
    id: "9a7b3c1d-2e4f-4a6b-8c0d-1e2f3a4b5c02",
    status: "idle",
    model: null,
    gitBranch: null,
    cwd: "/home/dev/billing-api",
    projectId: "01JCXK0000000000000000P002",
    lastActivityAt: NOW - 3_600_000,
    startedAt: NOW - 7_200_000,
  },
  {
    ...base,
    id: "c3d4e5f6-0718-4293-a4b5-c6d7e8f90a03",
    status: "stopped",
    usage: { inputTokens: 18_204, outputTokens: 4_311, costUsd: 0.42, costIsEstimate: true },
    lastActivityAt: NOW - 86_400_000,
    startedAt: NOW - 90_000_000,
    endedAt: NOW - 86_400_000,
  },
];

/** Capability profile of an Agent SDK session Ubuliera started (runtime-adapter.md matrix). */
export const managedCapabilities: RuntimeCapabilityProfile = {
  runtime: "agent_sdk",
  canStart: true,
  canStop: true,
  canInterrupt: true,
  canPause: false,
  canResume: true,
  canRestart: true,
  canSendMessage: "yes",
  canSetPermissionMode: true,
  emitsEvents: ["session.started", "session.stopped", "tool.invoked", "message.sent"],
  reportsUsage: "exact",
  notes: [],
};

/**
 * A Ubuliera-managed session of the running execution X002. Reachable by id and by the
 * `executionId` list filter only, so US1 list fixtures stay unchanged.
 */
export const managedSessionFixture: Session = {
  ...base,
  id: "0b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a04",
  executionId: "01JCXK0000000000000000X002",
  executionMode: "multi_session",
  currentTaskId: "T-1",
  runtime: "agent_sdk",
  observeOnly: false,
  worktreePath: "C:/work/ubuliera/.ubuliera/worktrees/X002/T-1",
  capabilities: managedCapabilities,
  status: "running",
  lastActivityAt: NOW - 5_000,
  startedAt: NOW - 400_000,
};

const allSessions = () => [...sessionFixtures, managedSessionFixture];

const CONTROL_STATUS: Record<string, SessionStatus> = {
  stop: "stopped",
  interrupt: "paused",
  resume: "running",
  restart: "starting",
};

const notFound: ApiErrorBody = { error: { code: "NOT_FOUND", message: "session not found" } };
const observeOnly: ApiErrorBody = {
  error: { code: "CONFLICT", message: "observe-only session — Ubuliera did not start it" },
};

/** POST /sessions/:id/messages and /agents/:id/messages answer with the recorded Message. */
export const sentMessage = (text: string, to: Message["to"], executionId: string | null) =>
  ({
    id: "01JCXK0000000000000000M999",
    executionId,
    taskId: null,
    from: { kind: "user" },
    to,
    type: "instruction",
    summary: text.slice(0, 500),
    ts: NOW,
  }) satisfies Message;

export const sessionHandlers = [
  http.get("*/api/v1/sessions", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.split(",");
    const projectId = url.searchParams.get("projectId");
    const executionId = url.searchParams.get("executionId");
    const items = (executionId ? allSessions() : sessionFixtures)
      .filter((s) => !executionId || s.executionId === executionId)
      .filter((s) => !status || status.includes(s.status))
      .filter((s) => !projectId || s.projectId === projectId)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return HttpResponse.json<SessionList>({ items });
  }),
  http.get("*/api/v1/sessions/:id", ({ params }) => {
    const session = allSessions().find((s) => s.id === params.id);
    if (!session) return HttpResponse.json(notFound, { status: 404 });
    return HttpResponse.json<SessionDetail>({
      session,
      agents: agentFixtures.filter((a) => a.sessionId === session.id),
    });
  }),
  http.post("*/api/v1/sessions/:id/:control", async ({ params, request }) => {
    const session = allSessions().find((s) => s.id === params.id);
    if (!session) return HttpResponse.json(notFound, { status: 404 });
    if (session.observeOnly) return HttpResponse.json(observeOnly, { status: 409 });
    const control = String(params.control);
    if (control === "messages") {
      const body = (await request.json()) as { text: string };
      return HttpResponse.json<Message>(
        sentMessage(body.text, { kind: "agent", agentId: session.id }, session.executionId),
      );
    }
    const status = CONTROL_STATUS[control];
    if (!status) return HttpResponse.json(notFound, { status: 404 });
    return HttpResponse.json<Session>({ ...session, status });
  }),
];
