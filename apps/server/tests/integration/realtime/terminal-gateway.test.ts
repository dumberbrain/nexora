import { createServer, type Server as HttpServer } from "node:http";
import { type AddressInfo } from "node:net";

import { type Session, type TerminalAttachAck } from "@nexora/contracts";
import { Server } from "socket.io";
import { io as ioc, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionKeys } from "../../../src/http/middleware/session-cookie";
import { type AuditInput } from "../../../src/modules/permission-manager/audit.service";
import { type TerminalChannel } from "../../../src/modules/runtime-manager";
import {
  createTerminalGateway,
  type TerminalGateway,
} from "../../../src/realtime/terminal-gateway";

/** In-memory lead terminal. */
class FakeChannel implements TerminalChannel {
  readonly writes: string[] = [];
  readonly resizes: [number, number][] = [];
  exited = false;
  private readonly out = new Set<(d: string) => void>();
  private readonly exits = new Set<(c: number | null) => void>();
  constructor(private buffer = "") {}
  backlog = () => this.buffer;
  write = (d: string) => void this.writes.push(d);
  resize = (c: number, r: number) => void this.resizes.push([c, r]);
  onOutput = (l: (d: string) => void) => {
    this.out.add(l);
    return () => void this.out.delete(l);
  };
  onExit = (l: (c: number | null) => void) => {
    this.exits.add(l);
    return () => void this.exits.delete(l);
  };
  print(d: string) {
    this.buffer += d;
    for (const l of [...this.out]) l(d);
  }
  exit(code: number) {
    this.exited = true;
    for (const l of [...this.exits]) l(code);
  }
  get listeners() {
    return this.out.size;
  }
}

type Row = Pick<Session, "id" | "runtime" | "observeOnly">;

let http: HttpServer;
let io: Server;
let gw: TerminalGateway;
let keys: SessionKeys;
let port: number;
let audits: AuditInput[];
let channels: Map<string, FakeChannel>;
let rows: Map<string, Row>;
const clients: Socket[] = [];

beforeEach(async () => {
  keys = new SessionKeys();
  audits = [];
  channels = new Map([["lead", new FakeChannel("$ previous screen\r\n")]]);
  rows = new Map<string, Row>([
    ["lead", { id: "lead", runtime: "agent_team_pty", observeOnly: false }],
    ["sdk", { id: "sdk", runtime: "agent_sdk", observeOnly: false }],
    ["gone", { id: "gone", runtime: "agent_team_pty", observeOnly: false }],
  ]);
  http = createServer();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  port = (http.address() as AddressInfo).port;
  io = new Server(http, { path: "/socket.io", serveClient: false });
  gw = createTerminalGateway({
    io,
    auth: {
      keys,
      envToken: undefined,
      verifyApiToken: (t) =>
        t === "read-token"
          ? { name: "viewer", scope: "read" }
          : t === "control-token"
            ? { name: "ctl", scope: "control" }
            : null,
    },
    terminals: { terminal: (id) => channels.get(id) },
    sessions: { get: (id) => rows.get(id) },
    audit: { record: (a) => audits.push(a) },
  });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  gw.close();
  await io.close();
});

function connect(opts: { cookie?: boolean; token?: string } = { cookie: true }) {
  const c = ioc(`http://127.0.0.1:${port}/terminal`, {
    path: "/socket.io",
    transports: ["websocket"],
    extraHeaders: opts.cookie ? { cookie: `nexora_session=${keys.session}` } : {},
    ...(opts.token ? { auth: { token: opts.token } } : {}),
    reconnection: false,
    forceNew: true,
  });
  clients.push(c);
  return c;
}

const connected = (c: Socket) =>
  new Promise<void>((resolve, reject) => {
    c.on("connect", () => resolve());
    c.on("connect_error", (e) => reject(e));
  });

const attach = (c: Socket, sessionId: string, cols = 100, rowsN = 30) =>
  new Promise<TerminalAttachAck>((resolve) =>
    c.emit("terminal:attach", { sessionId, cols, rows: rowsN }, resolve),
  );

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("/terminal gateway", () => {
  it("requires the same auth as /live", async () => {
    await expect(connected(connect({}))).rejects.toThrow(/auth/i);
    await expect(connected(connect({ token: "nope" }))).rejects.toThrow(/auth/i);
  });

  it("refuses sessions that are not Nexora-started Agent Teams leads", async () => {
    const c = connect();
    await connected(c);
    expect(await attach(c, "sdk")).toMatchObject({ ok: false });
    expect(await attach(c, "missing")).toMatchObject({ ok: false, error: "Session not found" });
    expect(await attach(c, "gone")).toMatchObject({ ok: false });
    expect((await attach(c, "lead", 5, 5)).ok).toBe(false); // schema: cols ≥ 20
    expect(audits.filter((a) => a.outcome === "denied")).toHaveLength(3);
  });

  it("attaches with backlog, streams output, forwards input/resize, audits once per attach", async () => {
    const lead = channels.get("lead") as FakeChannel;
    const c = connect();
    await connected(c);
    const out: string[] = [];
    c.on("terminal:output", (p: { sessionId: string; data: string }) => out.push(p.data));

    const ack = await attach(c, "lead");
    expect(ack).toEqual({ ok: true, backlog: "$ previous screen\r\n" });
    expect(lead.resizes).toEqual([[100, 30]]);

    lead.print("hello");
    c.emit("terminal:input", { sessionId: "lead", data: "1" });
    c.emit("terminal:input", { sessionId: "lead", data: "\r" });
    c.emit("terminal:resize", { sessionId: "lead", cols: 80, rows: 24 });
    c.emit("terminal:input", { sessionId: "sdk", data: "x" }); // not attached → ignored
    await wait(100);
    expect(out).toEqual(["hello"]);
    expect(lead.writes).toEqual(["1", "\r"]);
    expect(lead.resizes.at(-1)).toEqual([80, 24]);
    const ok = audits.filter((a) => a.outcome === "success");
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({
      actor: "user",
      action: "terminal.attach",
      targetType: "session",
      targetId: "lead",
    });

    const exits: unknown[] = [];
    c.on("terminal:exit", (p) => exits.push(p));
    lead.exit(0);
    await wait(100);
    expect(exits).toEqual([{ sessionId: "lead", exitCode: 0 }]);
    expect(lead.listeners).toBe(0);
  });

  it("read-scope API tokens may watch but not type", async () => {
    const lead = channels.get("lead") as FakeChannel;
    const c = connect({ token: "read-token" });
    await connected(c);
    expect((await attach(c, "lead")).ok).toBe(true);
    c.emit("terminal:input", { sessionId: "lead", data: "y" });
    await wait(80);
    expect(lead.writes).toEqual([]);
    expect(lead.resizes).toEqual([]);
    expect(audits[0]).toMatchObject({ actor: "mcp_client:viewer", details: { input: false } });
  });

  it("drops output listeners when the client disconnects", async () => {
    const lead = channels.get("lead") as FakeChannel;
    const c = connect();
    await connected(c);
    await attach(c, "lead");
    expect(lead.listeners).toBe(1);
    c.disconnect();
    await wait(100);
    expect(lead.listeners).toBe(0);
  });
});
