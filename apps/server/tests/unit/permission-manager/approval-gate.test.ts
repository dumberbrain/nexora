import { type EntityChanged, type NexoraEvent } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { REDACTED } from "../../../src/lib/redactor";
import { DomainEmitter } from "../../../src/modules/event-manager/domain-emitter";
import { EventBus } from "../../../src/modules/event-manager/event-bus";
import { EventStore } from "../../../src/modules/event-manager/event-store";
import { ApprovalService } from "../../../src/modules/permission-manager/approval.service";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";

const EXEC = "01JAAAAAAAAAAAAAAAAAAAAAAA";
let db: Db;
let store: EventStore;
let audit: AuditService;
let approvals: ApprovalService;
let events: NexoraEvent[];
let changes: EntityChanged[];

beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  const bus = new EventBus();
  store = new EventStore(db, bus, { batchMs: 5 });
  audit = new AuditService(db);
  approvals = new ApprovalService({ db, audit, emitter: new DomainEmitter(store, bus) });
  events = [];
  changes = [];
  bus.onEvent((e) => events.push(e));
  bus.onEntityChanged((c) => changes.push(c));
});
afterEach(() => {
  vi.useRealTimers();
  store.close();
  closeDb(db);
});

const request = (sessionId = "s-1") =>
  approvals.request({
    executionId: EXEC,
    taskId: "T-1",
    sessionId,
    agentId: null,
    toolName: "Bash",
    input: { command: "rm -rf build", apiKey: "sk-ant-abcdefghijklmnopqrstuvwxyz" },
    riskClass: "destructive",
    reason: "shell command",
  });

const pendingId = () => {
  const [first] = approvals.list("pending");
  if (!first) throw new Error("no pending approval");
  return first.id;
};

describe("ApprovalService (ApprovalGate)", () => {
  it("persists a pending, redacted request and emits permission.requested + entity.changed", () => {
    void request();
    const [a] = approvals.list("pending");
    expect(a).toMatchObject({
      executionId: EXEC,
      taskId: "T-1",
      sessionId: "s-1",
      action: "Bash",
      riskClass: "destructive",
      status: "pending",
    });
    expect(JSON.stringify(a?.details)).toContain(REDACTED);
    expect(JSON.stringify(a?.details)).not.toContain("sk-ant-");
    expect(events.map((e) => e.type)).toContain("permission.requested");
    expect(changes).toContainEqual(expect.objectContaining({ kind: "approval", id: a?.id }));
  });

  it("stays pending forever — no timeout ever auto-approves", async () => {
    vi.useFakeTimers();
    let settled: string | null = null;
    void request().then((d) => (settled = d));
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(settled).toBeNull();
    expect(approvals.list("pending")).toHaveLength(1);
  });

  it("approve resolves allow; reject resolves deny; both audited with the actor", async () => {
    const allowed = request("s-1");
    approvals.decide(pendingId(), { decision: "approve", note: "ok" }, "user");
    await expect(allowed).resolves.toBe("allow");

    const denied = request("s-2");
    approvals.decide(pendingId(), { decision: "reject" }, "mcp_client:cursor");
    await expect(denied).resolves.toBe("deny");

    const decided = approvals.list();
    expect(decided.map((a) => a.status).sort()).toEqual(["approved", "rejected"]);
    expect(decided.find((a) => a.status === "approved")).toMatchObject({
      decidedBy: "user",
      note: "ok",
    });
    const log = audit.list({ limit: 10 }).items;
    expect(log.filter((e) => e.action === "approval.decide")).toHaveLength(2);
    expect(log.map((e) => e.actor)).toContain("mcp_client:cursor");
    expect(events.filter((e) => e.type === "permission.decided")).toHaveLength(2);
  });

  it("a decision can only be made once (CONFLICT); unknown ids are NOT_FOUND", () => {
    void request();
    const id = pendingId();
    approvals.decide(id, { decision: "approve" }, "user");
    expect(() => approvals.decide(id, { decision: "reject" }, "user")).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    expect(() =>
      approvals.decide("01JZZZZZZZZZZZZZZZZZZZZZZZ", { decision: "approve" }, "user"),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("session death expires its pending requests (deny), audited, others untouched", async () => {
    const dying = request("s-dead");
    void request("s-alive");
    expect(approvals.expireForSession("s-dead")).toBe(1);
    await expect(dying).resolves.toBe("deny");
    const statuses = approvals.list().map((a) => [a.sessionId, a.status]);
    expect(statuses).toContainEqual(["s-dead", "expired_session"]);
    expect(statuses).toContainEqual(["s-alive", "pending"]);
    expect(audit.list({ limit: 10 }).items.map((e) => e.action)).toContain("approval.expire");
  });

  it("task approvals notify listeners when decided", () => {
    const seen: string[] = [];
    approvals.onDecided((a) => seen.push(`${a.taskId}:${a.status}`));
    const a = approvals.createTaskApproval({
      executionId: EXEC,
      taskId: "T-2",
      riskClass: "deploy",
      title: "Deploy to prod",
    });
    expect(a.status).toBe("pending");
    expect(a.action).toBe("task.start");
    approvals.decide(a.id, { decision: "approve" }, "user");
    expect(seen).toEqual(["T-2:approved"]);
    expect(approvals.approvedTaskIds(EXEC)).toEqual(new Set(["T-2"]));
  });

  it("workflow approvals wait for a decision and can be expired one by one", async () => {
    const one = approvals.requestWorkflowApproval({
      executionId: EXEC,
      nodeId: "ok",
      label: "Approve merge",
      message: "Ship it?",
      riskClass: "destructive",
    });
    expect(one.approval).toMatchObject({
      action: "workflow.approval",
      status: "pending",
      taskId: null,
    });
    approvals.decide(one.approval.id, { decision: "approve" }, "user");
    await expect(one.decision).resolves.toBe("allow");

    const two = approvals.requestWorkflowApproval({
      executionId: EXEC,
      nodeId: "ok",
      label: "Approve merge",
      message: "Ship it?",
      riskClass: "normal",
    });
    expect(approvals.expireRequest(two.approval.id, "run cancelled")).toBe(true);
    await expect(two.decision).resolves.toBe("deny");
    expect(approvals.get(two.approval.id).status).toBe("expired_session");
    expect(approvals.expireRequest(two.approval.id, "again")).toBe(false);
  });
});
