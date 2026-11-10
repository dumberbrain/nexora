import { EventEmitter } from "node:events";

import { type UbulieraEvent } from "@ubuliera/contracts";

/**
 * Minimal stand-in for the /live Socket.IO client, for component tests of live widgets:
 *   vi.mock("@/shared/socket/client", async (orig) => ({
 *     ...(await orig()), getLiveSocket: () => fakeSocket }));
 * It starts connected; `pushEvents` simulates a server `event` batch.
 */
export class FakeSocket {
  connected = true;
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
    ack?.({ ok: true, replayed: 0, gap: false });
    return this;
  }
  pushEvents(events: UbulieraEvent[]) {
    this.bus.emit("event", { events });
  }
}
