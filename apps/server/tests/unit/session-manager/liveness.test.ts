import { type NexoraEvent, type Session } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventBus, type EventInput } from "../../../src/modules/event-manager";
import { LivenessMonitor } from "../../../src/modules/session-manager/liveness-monitor";

const IDLE = 600_000;
const TURN = 1_800_000;

let bus: EventBus;
let appended: EventInput[];
let patches: { id: string; patch: Partial<Session> }[];
let entityChanges: unknown[];
let status: Session["status"];
let monitor: LivenessMonitor;

function event(sessionId: string, type: NexoraEvent["type"] = "tool.invoked"): NexoraEvent {
  return {
    id: "01H",
    ts: Date.now(),
    type,
    source: "agent_sdk",
    reliability: "authoritative",
    severity: "info",
    executionId: "E",
    sessionId,
    agentId: null,
    taskId: "T-1",
    summary: "x",
    payload: null,
    truncated: false,
  };
}

function handle() {
  return {
    interrupt: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  bus = new EventBus();
  appended = [];
  patches = [];
  entityChanges = [];
  status = "running";
  bus.onEntityChanged((c) => entityChanges.push(c));
  monitor = new LivenessMonitor({
    bus,
    sessions: {
      get: (id) => ({ id, status }) as Session,
      update: (id, patch) => {
        patches.push({ id, patch });
        if (patch.status) status = patch.status;
      },
    },
    events: {
      append: (e) => {
        appended.push(e);
        // the real EventStore publishes synchronously on append
        bus.publishEvent(event(e.sessionId ?? "", e.type));
      },
    },
  });
});

afterEach(() => {
  monitor.close();
  vi.useRealTimers();
});

const watch = (h = handle(), canInterrupt = true, onTurnTimeout = vi.fn()) => {
  monitor.watch("s1", {
    handle: h,
    canInterrupt,
    idleTimeoutMs: IDLE,
    turnTimeoutMs: TURN,
    executionId: "E",
    taskId: "T-1",
    onTurnTimeout,
  });
  monitor.turnStarted("s1");
  return { h, onTurnTimeout };
};

describe("LivenessMonitor — idle", () => {
  it("marks the session unresponsive and emits an error event after idleTimeoutMs", () => {
    watch();
    vi.advanceTimersByTime(IDLE - 1);
    expect(appended).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(patches).toContainEqual({ id: "s1", patch: { status: "unresponsive" } });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: "error",
      sessionId: "s1",
      executionId: "E",
      taskId: "T-1",
      severity: "warn",
    });
    expect(entityChanges).toContainEqual({
      kind: "session",
      id: "s1",
      patch: { status: "unresponsive" },
    });
  });

  it("resets the idle timer on every event of that session only", () => {
    watch();
    vi.advanceTimersByTime(IDLE - 10);
    bus.publishEvent(event("s1"));
    vi.advanceTimersByTime(IDLE - 10);
    bus.publishEvent(event("other-session"));
    vi.advanceTimersByTime(9);
    expect(appended).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(appended).toHaveLength(1);
  });

  it("does not re-fire because of its own error event, and recovers on new activity", () => {
    watch();
    vi.advanceTimersByTime(IDLE * 1.5);
    expect(appended).toHaveLength(1);
    bus.publishEvent(event("s1"));
    expect(status).toBe("running");
    vi.advanceTimersByTime(IDLE);
    expect(appended).toHaveLength(2);
  });

  it("is not armed between turns or while waiting for an approval", () => {
    watch();
    monitor.turnEnded("s1");
    vi.advanceTimersByTime(IDLE * 2);
    expect(appended).toHaveLength(0);

    monitor.turnStarted("s1");
    monitor.setWaiting("s1", true);
    vi.advanceTimersByTime(IDLE * 2);
    expect(appended).toHaveLength(0);
    monitor.setWaiting("s1", false);
    vi.advanceTimersByTime(IDLE);
    expect(appended).toHaveLength(1);
  });
});

describe("LivenessMonitor — turn timeout", () => {
  it("interrupts the session when the runtime supports it, then reports the timeout", async () => {
    const { h, onTurnTimeout } = watch();
    // keep the session active so only the turn timer fires
    for (let t = 0; t < TURN; t += IDLE / 2) {
      vi.advanceTimersByTime(IDLE / 2);
      bus.publishEvent(event("s1"));
    }
    await vi.runOnlyPendingTimersAsync();
    expect(h.interrupt).toHaveBeenCalledTimes(1);
    expect(h.stop).not.toHaveBeenCalled();
    expect(onTurnTimeout).toHaveBeenCalledWith({ sessionId: "s1", taskId: "T-1" });
  });

  it("stops the session when interrupt is not supported", async () => {
    const { h, onTurnTimeout } = watch(handle(), false);
    monitor.setWaiting("s1", false);
    vi.advanceTimersByTime(TURN);
    await vi.runOnlyPendingTimersAsync();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.interrupt).not.toHaveBeenCalled();
    expect(onTurnTimeout).toHaveBeenCalledTimes(1);
  });

  it("falls back to stop when interrupt fails", async () => {
    const h = handle();
    h.interrupt.mockRejectedValueOnce(new Error("nope"));
    const { onTurnTimeout } = watch(h);
    vi.advanceTimersByTime(TURN);
    await vi.runOnlyPendingTimersAsync();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(onTurnTimeout).toHaveBeenCalledTimes(1);
  });

  it("clears the turn timer when the turn ends and on unwatch", async () => {
    const { h, onTurnTimeout } = watch();
    vi.advanceTimersByTime(TURN - 1);
    monitor.turnEnded("s1");
    vi.advanceTimersByTime(TURN);
    monitor.turnStarted("s1");
    monitor.unwatch("s1");
    vi.advanceTimersByTime(TURN * 2);
    await vi.runOnlyPendingTimersAsync();
    expect(h.interrupt).not.toHaveBeenCalled();
    expect(onTurnTimeout).not.toHaveBeenCalled();
  });

  it("does not count time spent waiting for a human approval", async () => {
    const { h } = watch();
    vi.advanceTimersByTime(TURN - 1000);
    monitor.setWaiting("s1", true);
    vi.advanceTimersByTime(TURN * 2);
    expect(h.interrupt).not.toHaveBeenCalled();
    monitor.setWaiting("s1", false);
    vi.advanceTimersByTime(999);
    expect(h.interrupt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.runOnlyPendingTimersAsync();
    expect(h.interrupt).toHaveBeenCalledTimes(1);
  });
});
