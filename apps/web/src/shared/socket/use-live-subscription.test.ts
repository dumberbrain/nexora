import { EventEmitter } from "node:events";

import { type NexoraEvent } from "@nexora/contracts";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type LiveSocket } from "./client";
import { __resetCursorsForTests, useLiveSubscription } from "./use-live-subscription";

/** Minimal stand-in for a Socket.IO client socket. */
class FakeSocket {
  connected = false;
  private readonly bus = new EventEmitter();
  readonly sent: Array<{ event: string; payload: unknown }> = [];
  ackGap = false;

  on(event: string, fn: (...a: unknown[]) => void) {
    this.bus.on(event, fn);
    return this;
  }
  off(event: string, fn: (...a: unknown[]) => void) {
    this.bus.off(event, fn);
    return this;
  }
  emit(event: string, payload: unknown, ack?: (r: unknown) => void) {
    this.sent.push({ event, payload });
    ack?.({ ok: true, replayed: 0, gap: this.ackGap });
    return this;
  }
  /** simulate server → client */
  serverEmit(event: string, ...args: unknown[]) {
    this.bus.emit(event, ...args);
  }
  connect() {
    this.connected = true;
    this.bus.emit("connect");
  }
  drop() {
    this.connected = false;
  }
}

const ev = (id: string, sessionId = "s1"): NexoraEvent => ({
  id,
  ts: 1,
  type: "tool.invoked",
  source: "hook",
  reliability: "authoritative",
  severity: "info",
  executionId: null,
  sessionId,
  agentId: null,
  taskId: null,
  summary: id,
  payload: {},
  truncated: false,
});

afterEach(() => __resetCursorsForTests());

function setup(fake: FakeSocket, extra: { onGap?: () => void } = {}) {
  const onEvents = vi.fn();
  const hook = renderHook(() =>
    useLiveSubscription({
      scope: "session",
      id: "s1",
      onEvents,
      socket: fake as unknown as LiveSocket,
      ...extra,
    }),
  );
  return { onEvents, hook };
}

describe("useLiveSubscription", () => {
  it("subscribes on connect without a cursor the first time", () => {
    const fake = new FakeSocket();
    setup(fake);
    act(() => fake.connect());
    expect(fake.sent).toEqual([{ event: "subscribe", payload: { scope: "session", id: "s1" } }]);
  });

  it("delivers only matching, unseen events", () => {
    const fake = new FakeSocket();
    const { onEvents } = setup(fake);
    act(() => fake.connect());
    act(() => fake.serverEmit("event", { events: [ev("01A"), ev("01B", "other"), ev("01C")] }));
    act(() => fake.serverEmit("event", { events: [ev("01C"), ev("01D")] }));
    expect(onEvents.mock.calls.map((c) => (c[0] as NexoraEvent[]).map((e) => e.id))).toEqual([
      ["01A", "01C"],
      ["01D"],
    ]);
  });

  it("re-subscribes with sinceEventId = last seen id after reconnect", () => {
    const fake = new FakeSocket();
    setup(fake);
    act(() => fake.connect());
    act(() => fake.serverEmit("event", { events: [ev("01A"), ev("01B")] }));
    act(() => {
      fake.drop();
      fake.connect();
    });
    expect(fake.sent.at(-1)).toEqual({
      event: "subscribe",
      payload: { scope: "session", id: "s1", sinceEventId: "01B" },
    });
  });

  it("calls onGap when the server reports too many missed events", () => {
    const fake = new FakeSocket();
    fake.ackGap = true;
    const onGap = vi.fn();
    setup(fake, { onGap });
    act(() => fake.connect());
    expect(onGap).toHaveBeenCalledOnce();
  });

  it("unsubscribes and stops delivering after unmount", () => {
    const fake = new FakeSocket();
    const { onEvents, hook } = setup(fake);
    act(() => fake.connect());
    hook.unmount();
    expect(fake.sent.at(-1)).toEqual({
      event: "unsubscribe",
      payload: { scope: "session", id: "s1" },
    });
    act(() => fake.serverEmit("event", { events: [ev("01Z")] }));
    expect(onEvents).not.toHaveBeenCalled();
  });
});
