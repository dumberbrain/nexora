import { EventEmitter } from "node:events";

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { entityDetailKey, entityListKey, statsKey } from "@/shared/api";
import { type LiveSocket } from "@/shared/socket/client";

import { startSocketBridge } from "./socket-bridge";

function fakeSocket() {
  const bus = new EventEmitter();
  return {
    socket: {
      on: (e: string, fn: (...a: unknown[]) => void) => bus.on(e, fn),
      off: (e: string, fn: (...a: unknown[]) => void) => bus.off(e, fn),
    } as unknown as LiveSocket,
    push: (e: string, payload: unknown) => bus.emit(e, payload),
  };
}

describe("startSocketBridge", () => {
  it("patches a cached detail and invalidates only that entity's lists", () => {
    const qc = new QueryClient();
    const { socket, push } = fakeSocket();
    qc.setQueryData(entityDetailKey("session", "s1"), { id: "s1", status: "running", cwd: "/r" });
    qc.setQueryData(entityListKey("session"), { items: [] });
    qc.setQueryData(entityListKey("agent"), { items: [] });
    startSocketBridge(qc, socket);

    push("entity.changed", { kind: "session", id: "s1", patch: { status: "idle" } });

    expect(qc.getQueryData(entityDetailKey("session", "s1"))).toEqual({
      id: "s1",
      status: "idle",
      cwd: "/r",
    });
    expect(qc.getQueryState(entityListKey("session"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(entityListKey("agent"))?.isInvalidated).toBe(false);
  });

  it("does not create a detail entry that was never fetched", () => {
    const qc = new QueryClient();
    const { socket, push } = fakeSocket();
    startSocketBridge(qc, socket);
    push("entity.changed", { kind: "task", id: "T-1", patch: { status: "running" } });
    expect(qc.getQueryData(entityDetailKey("task", "T-1"))).toBeUndefined();
  });

  it("stores pushed stats and stops after cleanup", () => {
    const qc = new QueryClient();
    const { socket, push } = fakeSocket();
    const stop = startSocketBridge(qc, socket);
    const stats = {
      activeSessions: 2,
      activeAgents: 3,
      idleAgents: 1,
      completedTasks: 4,
      failedTasks: 0,
      pendingApprovals: 1,
      runningWorkflows: 0,
      currentMode: null,
    };
    push("stats", stats);
    expect(qc.getQueryData(statsKey)).toEqual(stats);
    stop();
    push("stats", { ...stats, activeSessions: 9 });
    expect(qc.getQueryData(statsKey)).toEqual(stats);
  });
});
