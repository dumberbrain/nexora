import {
  MessageSchema,
  type UbulieraEvent,
  type RuntimeCapabilityProfile,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { CommunicationService } from "../../../src/modules/communication-manager/communication.service";
import { MessageRepository } from "../../../src/modules/communication-manager/message.repository";
import { DomainEmitter } from "../../../src/modules/event-manager/domain-emitter";
import { EventBus } from "../../../src/modules/event-manager/event-bus";
import { EventStore } from "../../../src/modules/event-manager/event-store";
import {
  capabilityProfile,
  FakeManagedRuntime,
  type StartInput,
} from "../../fakes/fake-managed-runtime";

const EXEC = "01JAAAAAAAAAAAAAAAAAAAAAAA";
let db: Db;
let store: EventStore;
let runtime: FakeManagedRuntime;
let caps: RuntimeCapabilityProfile | null;
let comm: CommunicationService;
let events: UbulieraEvent[];
let sessionId: string;

const START: StartInput = {
  executionId: EXEC,
  taskId: "T-1",
  projectRoot: "/repo",
  cwd: "/repo/.ubuliera/worktrees/x/main",
  prompt: "p",
  ownedPaths: [],
  permissionMode: "default",
  executionMode: "multi_session",
  idleTimeoutMs: 600_000,
  turnTimeoutMs: 1_800_000,
};

beforeEach(async () => {
  db = openDb({ dataDir: ":memory:" });
  const bus = new EventBus();
  store = new EventStore(db, bus, { batchMs: 5 });
  runtime = new FakeManagedRuntime();
  caps = capabilityProfile();
  events = [];
  bus.onEvent((e) => events.push(e));
  comm = new CommunicationService({
    messages: new MessageRepository(db),
    runtime,
    capabilityOf: () => caps,
    emitter: new DomainEmitter(store, bus),
  });
  const handle = await runtime.startManagedSession(START, {
    approvals: { request: () => Promise.resolve("deny") },
  });
  sessionId = await handle.sessionId;
});
afterEach(() => {
  store.close();
  closeDb(db);
});

const send = (text: string, target = sessionId) =>
  comm.sendToSession({
    sessionId: target,
    text,
    from: { kind: "user" },
    type: "instruction",
    executionId: EXEC,
    taskId: "T-1",
  });

describe("CommunicationService", () => {
  it("delivers through SessionHandle.sendMessage and records Message + message.sent", async () => {
    const msg = await send("Please also update the README");
    expect(runtime.sessions[0]?.sent).toEqual(["Please also update the README"]);
    expect(MessageSchema.parse(msg)).toMatchObject({
      executionId: EXEC,
      taskId: "T-1",
      from: { kind: "user" },
      to: { kind: "agent", agentId: sessionId },
      type: "instruction",
    });
    expect(comm.list({ executionId: EXEC })).toEqual([msg]);
    const sent = events.find((e) => e.type === "message.sent");
    expect(sent).toMatchObject({ executionId: EXEC, sessionId, taskId: "T-1" });
  });

  it("redacts the summary and caps it at 500 chars (the agent still gets the full text)", async () => {
    const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
    const long = `use key ${secret} ${"x".repeat(2000)}`;
    const msg = await send(long);
    expect(msg.summary.length).toBeLessThanOrEqual(500);
    expect(msg.summary).not.toContain(secret);
    expect(runtime.sessions[0]?.sent[0]).toBe(long);
  });

  it("refuses with CAPABILITY_UNSUPPORTED when the runtime cannot receive messages", async () => {
    caps = capabilityProfile({ canSendMessage: "no" });
    await expect(send("hi")).rejects.toMatchObject({ code: "CAPABILITY_UNSUPPORTED", status: 422 });
    expect(runtime.sessions[0]?.sent).toEqual([]);
    expect(comm.list({ executionId: EXEC })).toEqual([]);
  });

  it("maps an adapter CapabilityUnsupportedError to CAPABILITY_UNSUPPORTED and records nothing", async () => {
    runtime.sessions.length = 0;
    runtime.sendSupported = false;
    const h = await runtime.startManagedSession(START, {
      approvals: { request: () => Promise.resolve("deny") },
    });
    await expect(send("hi", await h.sessionId)).rejects.toMatchObject({
      code: "CAPABILITY_UNSUPPORTED",
    });
    expect(events.some((e) => e.type === "message.sent")).toBe(false);
  });

  it("refuses sessions Ubuliera does not manage (observe-only)", async () => {
    await expect(send("hi", "external-session")).rejects.toMatchObject({
      code: "CAPABILITY_UNSUPPORTED",
    });
  });

  it("records coordinator messages without delivery", () => {
    const m = comm.record({
      from: { kind: "coordinator" },
      to: { kind: "agent", agentId: "a-1" },
      type: "status",
      text: "T-1 completed",
      executionId: EXEC,
      taskId: "T-1",
      sessionId: null,
    });
    expect(comm.list({ executionId: EXEC })).toEqual([m]);
  });
});
