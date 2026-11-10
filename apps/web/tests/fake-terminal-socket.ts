import { EventEmitter } from "node:events";

import { type TerminalAttachAck } from "@ubuliera/contracts";

/**
 * Stand-in for the /terminal Socket.IO client (widgets/terminal). Mock the widget's socket module:
 *   vi.mock("../api/terminal-socket", () => ({
 *     createTerminalSocket: () => fake, connectTerminalSocket: (s) => s.connect() }));
 * `connect()` fires "connect"; `attachAck` answers `terminal:attach`; `serverEmit` simulates
 * server → client events.
 */
export class FakeTerminalSocket {
  connected = false;
  disconnected = false;
  attachAck: TerminalAttachAck = { ok: true, backlog: "" };
  private readonly bus = new EventEmitter();
  readonly sent: Array<{ event: string; payload: unknown }> = [];

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
    if (event === "terminal:attach") ack?.(this.attachAck);
    return this;
  }
  connect() {
    this.connected = true;
    this.bus.emit("connect");
    return this;
  }
  disconnect() {
    this.connected = false;
    this.disconnected = true;
    return this;
  }
  serverEmit(event: string, payload: unknown) {
    this.bus.emit(event, payload);
  }
  listenerCount(event: string) {
    return this.bus.listenerCount(event);
  }
  sentOf(event: string) {
    return this.sent.filter((s) => s.event === event).map((s) => s.payload);
  }
}
