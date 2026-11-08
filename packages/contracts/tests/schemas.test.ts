import { describe, expect, it } from "vitest";

import {
  AbsolutePathSchema,
  ApiErrorBodySchema,
  AuditActorSchema,
  boardColumnOf,
  CreateExecutionInputSchema,
  ERROR_STATUS,
  EVENT_TYPES,
  EventQuerySchema,
  EventSchema,
  ExecutionConfigSchema,
  MAX_EVENT_SUMMARY,
  OnErrorSchema,
  PaginationQuerySchema,
  ProjectNameSchema,
  PromptSchema,
  RetryPolicySchema,
  roomOf,
  SessionStatusSchema,
  SubscribePayloadSchema,
  TASK_STATUSES,
  TaskIdSchema,
  TaskTitleSchema,
  UlidSchema,
} from "../src";

const ULID = "01JC0000000000000000000000";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  expect(schema.safeParse(v).success).toBe(true);
const bad = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  expect(schema.safeParse(v).success).toBe(false);

describe("primitives", () => {
  it("ULID: 26 Crockford chars only", () => {
    ok(UlidSchema, ULID);
    bad(UlidSchema, ULID.slice(1));
    bad(UlidSchema, "01JC000000000000000000000I"); // I is not Crockford
  });

  it("absolute path: POSIX, Windows drive, UNC; no '..'", () => {
    ok(AbsolutePathSchema, "/home/u/repo");
    ok(AbsolutePathSchema, "C:\\Users\\u\\repo");
    ok(AbsolutePathSchema, "C:/Users/u/repo");
    ok(AbsolutePathSchema, "\\\\server\\share\\repo");
    bad(AbsolutePathSchema, "relative/repo");
    bad(AbsolutePathSchema, "/home/u/../etc");
    bad(AbsolutePathSchema, "");
  });
});

describe("Project.name — 1–120 chars", () => {
  it("accepts 1 and 120, rejects 0 and 121", () => {
    ok(ProjectNameSchema, "a");
    ok(ProjectNameSchema, "a".repeat(120));
    bad(ProjectNameSchema, "");
    bad(ProjectNameSchema, "   ");
    bad(ProjectNameSchema, "a".repeat(121));
  });
});

describe("Execution.prompt — 1–20 000 chars", () => {
  it("boundaries", () => {
    ok(PromptSchema, "x");
    ok(PromptSchema, "x".repeat(20_000));
    bad(PromptSchema, "");
    bad(PromptSchema, "x".repeat(20_001));
  });

  it("create input requires a ULID projectId", () => {
    ok(CreateExecutionInputSchema, { projectId: ULID, prompt: "build it" });
    bad(CreateExecutionInputSchema, { projectId: "p1", prompt: "build it" });
  });
});

describe("Execution.config", () => {
  it("defaults: maxParallelSessions 4, idle 600 000, turn 1 800 000, consent false", () => {
    const c = ExecutionConfigSchema.parse({});
    expect(c.maxParallelSessions).toBe(4);
    expect(c.idleTimeoutMs).toBe(600_000);
    expect(c.turnTimeoutMs).toBe(1_800_000);
    expect(c.modelAnalysisConsent).toBe(false);
    expect(c.runTestsOnVerify).toBe(false);
  });

  it("maxParallelSessions ≤ 8 and ≥ 1", () => {
    ok(ExecutionConfigSchema, { maxParallelSessions: 8 });
    bad(ExecutionConfigSchema, { maxParallelSessions: 9 });
    bad(ExecutionConfigSchema, { maxParallelSessions: 0 });
  });
});

describe("Task", () => {
  it("id is T-<n>", () => {
    ok(TaskIdSchema, "T-1");
    ok(TaskIdSchema, "T-42");
    bad(TaskIdSchema, "T-0");
    bad(TaskIdSchema, "T1");
    bad(TaskIdSchema, "t-1");
  });

  it("title 1–200", () => {
    ok(TaskTitleSchema, "a".repeat(200));
    bad(TaskTitleSchema, "a".repeat(201));
    bad(TaskTitleSchema, "");
  });

  it("every status maps to exactly one board column", () => {
    const columns = TASK_STATUSES.values.map((s) => boardColumnOf(s));
    expect(columns).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_progress",
      "in_progress",
      "in_progress",
      "review",
      "completed",
      "failed",
      "failed",
    ]);
  });
});

describe("Session status includes unresponsive (FR-034)", () => {
  it("parses", () => ok(SessionStatusSchema, "unresponsive"));
});

describe("Event", () => {
  const base = {
    id: ULID,
    ts: 1,
    type: "tool.invoked",
    source: "hook",
    reliability: "authoritative",
    severity: "info",
    executionId: null,
    sessionId: "s",
    agentId: null,
    taskId: null,
    payload: {},
    truncated: false,
  };

  it("summary ≤ 500 chars", () => {
    ok(EventSchema, { ...base, summary: "x".repeat(MAX_EVENT_SUMMARY) });
    bad(EventSchema, { ...base, summary: "x".repeat(MAX_EVENT_SUMMARY + 1) });
  });

  it("has exactly the 20 documented event types", () => {
    expect(EVENT_TYPES.values).toHaveLength(20);
  });

  it("query parses comma lists and coerces limit 1..200", () => {
    const q = EventQuerySchema.parse({ type: "error,tool.invoked", limit: "10" });
    expect(q.type).toEqual(["error", "tool.invoked"]);
    expect(q.limit).toBe(10);
    bad(EventQuerySchema, { limit: "201" });
    bad(EventQuerySchema, { type: "not.a.type" });
  });
});

describe("Workflow node", () => {
  it("retry maxAttempts ≤ 5", () => {
    ok(RetryPolicySchema, { maxAttempts: 5, backoffMs: 0 });
    bad(RetryPolicySchema, { maxAttempts: 6, backoffMs: 0 });
    bad(RetryPolicySchema, { maxAttempts: 0, backoffMs: 0 });
  });

  it("onError is fail | continue | goto(nodeId)", () => {
    ok(OnErrorSchema, "fail");
    ok(OnErrorSchema, "continue");
    ok(OnErrorSchema, { goto: "n2" });
    bad(OnErrorSchema, "retry");
    bad(OnErrorSchema, { goto: "" });
  });
});

describe("API common", () => {
  it("error codes map to the documented HTTP statuses", () => {
    expect(ERROR_STATUS).toEqual({
      VALIDATION_FAILED: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      CAPABILITY_UNSUPPORTED: 422,
      APPROVAL_REQUIRED: 428,
      INTERNAL: 500,
    });
    ok(ApiErrorBodySchema, { error: { code: "CONFLICT", message: "nope" } });
    bad(ApiErrorBodySchema, { error: { code: "TEAPOT", message: "nope" } });
  });

  it("pagination limit 1..200, default 50", () => {
    expect(PaginationQuerySchema.parse({}).limit).toBe(50);
    ok(PaginationQuerySchema, { limit: "1" });
    ok(PaginationQuerySchema, { limit: "200" });
    bad(PaginationQuerySchema, { limit: "0" });
    bad(PaginationQuerySchema, { limit: "201" });
  });

  it("audit actor is user | system | mcp_client:<name>", () => {
    ok(AuditActorSchema, "user");
    ok(AuditActorSchema, "mcp_client:cursor");
    bad(AuditActorSchema, "admin");
  });
});

describe("Socket", () => {
  it("non-global subscriptions need an id", () => {
    ok(SubscribePayloadSchema, { scope: "global" });
    ok(SubscribePayloadSchema, { scope: "session", id: "abc", sinceEventId: ULID });
    bad(SubscribePayloadSchema, { scope: "session" });
  });

  it("room names", () => {
    expect(roomOf("global")).toBe("global");
    expect(roomOf("execution", ULID)).toBe(`execution:${ULID}`);
  });
});
