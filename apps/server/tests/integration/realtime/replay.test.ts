import { createServer, type Server as HttpServer } from "node:http";
import { type AddressInfo } from "node:net";

import {
  type ClientToServerEvents,
  type EventBatch,
  type NexoraEvent,
  type ReplayDone,
  type ServerToClientEvents,
  type SubscribeAck,
} from "@nexora/contracts";
import { io as ioc, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { SessionKeys } from "../../../src/http/middleware/session-cookie";
import { EventBus, type EventInput, EventStore } from "../../../src/modules/event-manager";
import { createGateway, type Gateway } from "../../../src/realtime/gateway";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let http: HttpServer;
let db: Db;
let bus: EventBus;
let store: EventStore;
let gateway: Gateway;
let keys: SessionKeys;
let port: number;
const clients: Client[] = [];

const ev = (over: Partial<EventInput> = {}): EventInput => ({
  type: "tool.invoked",
  source: "hook",
  reliability: "authoritative",
  severity: "info",
  sessionId: "s1",
  summary: "x",
  ...over,
});

beforeEach(async () => {
  db = openDb({ dataDir: ":memory:" });
  bus = new EventBus();
  store = new EventStore(db, bus, { batchMs: 20 });
  keys = new SessionKeys();
  http = createServer();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  port = (http.address() as AddressInfo).port;
  gateway = createGateway({
    httpServer: http,
    store,
    bus,
    keys,
    policy: { remote: false, ports: [port] },
    envToken: undefined,
    batchMs: 50,
    maxReplay: 5,
  });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await gateway.close();
  store.close();
  closeDb(db);
});

function connect(headers: Record<string, string> = { cookie: `nexora_session=${keys.session}` }) {
  const c: Client = ioc(`http://127.0.0.1:${port}/live`, {
    transports: ["websocket"],
    extraHeaders: headers,
    reconnection: false,
    forceNew: true,
  });
  clients.push(c);
  return c;
}

const connected = (c: Client) =>
  new Promise<void>((resolve, reject) => {
    c.on("connect", () => resolve());
    c.on("connect_error", (e) => reject(e));
  });

const subscribe = (c: Client, payload: Parameters<ClientToServerEvents["subscribe"]>[0]) =>
  new Promise<SubscribeAck>((resolve) => c.emit("subscribe", payload, resolve));

function collect(c: Client) {
  const log: Array<{ kind: "event"; ids: string[] } | { kind: "done"; done: ReplayDone }> = [];
  c.on("event", (b: EventBatch) => log.push({ kind: "event", ids: b.events.map((e) => e.id) }));
  c.on("replay.done", (done) => log.push({ kind: "done", done }));
  return log;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("realtime gateway", () => {
  it("rejects connections without a session", async () => {
    await expect(connected(connect({}))).rejects.toThrow(/auth/i);
  });

  it("rejects a foreign origin even with a valid session", async () => {
    const c = connect({ cookie: `nexora_session=${keys.session}`, origin: "http://evil.example" });
    await expect(connected(c)).rejects.toThrow();
  });

  it("rejects invalid subscribe payloads", async () => {
    const c = connect();
    await connected(c);
    const ack = await subscribe(c, { scope: "session" } as never);
    expect(ack.ok).toBe(false);
  });

  it("replays events after the cursor in order, then replay.done, then live", async () => {
    const before: NexoraEvent[] = [store.append(ev()), store.append(ev()), store.append(ev())];
    store.append(ev({ sessionId: "other" }));
    const c = connect();
    const log = collect(c);
    await connected(c);

    const ack = await subscribe(c, { scope: "session", id: "s1", sinceEventId: before[0]!.id });
    expect(ack).toMatchObject({ ok: true, replayed: 2, gap: false });

    const live = store.append(ev());
    await wait(150);

    const replayIds = before.slice(1).map((e) => e.id);
    expect(log[0]).toEqual({ kind: "event", ids: replayIds });
    expect(log[1]).toMatchObject({ kind: "done", done: { lastEventId: replayIds.at(-1) } });
    // live batches may also carry events appended just before the join — the client dedupes by id
    const later = log.slice(2).flatMap((l) => (l.kind === "event" ? l.ids : []));
    expect(later).toContain(live.id);
  });

  it("flags a gap instead of replaying when more than maxReplay events were missed", async () => {
    const first = store.append(ev());
    for (let i = 0; i < 6; i++) store.append(ev());
    const c = connect();
    const log = collect(c);
    await connected(c);
    const ack = await subscribe(c, { scope: "session", id: "s1", sinceEventId: first.id });
    expect(ack).toMatchObject({ ok: true, replayed: 0, gap: true });
    await wait(30);
    expect(log.filter((l) => l.kind === "event")).toHaveLength(0);
    expect(log.some((l) => l.kind === "done")).toBe(true);
  });

  it("batches live events per room", async () => {
    const c = connect();
    const log = collect(c);
    await connected(c);
    await subscribe(c, { scope: "global" });
    const a = store.append(ev());
    const b = store.append(ev({ sessionId: "s2" }));
    const d = store.append(ev({ sessionId: "s3" }));
    await wait(150);
    const batches = log.filter((l) => l.kind === "event");
    expect(batches).toEqual([{ kind: "event", ids: [a.id, b.id, d.id] }]);
  });

  it("forwards entity changes to global subscribers", async () => {
    const c = connect();
    await connected(c);
    await subscribe(c, { scope: "global" });
    const got = new Promise((r) => c.on("entity.changed", r));
    bus.publishEntityChanged({ kind: "session", id: "s1", patch: { status: "idle" } });
    await expect(got).resolves.toEqual({ kind: "session", id: "s1", patch: { status: "idle" } });
  });
});
