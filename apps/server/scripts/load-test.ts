/**
 * Load test (T159, SC-001): N synthetic Claude Code sessions post hook events through the real
 * public ingest endpoint while a Socket.IO client subscribed like the dashboard (namespace /live,
 * scope "global", session cookie) measures ingest → socket arrival latency. The socket arrival
 * is the proxy for "rendered in the dashboard": the SPA renders straight from that batch.
 *
 *   npm run load-test --workspace @nexora/server -- [--url http://127.0.0.1:3022]
 *     [--duration 60] [--sessions 10] [--rate 1000] [--threshold 2000]
 *
 *   --url        running Nexora server (loopback: hook ingest only accepts loopback peers)
 *   --duration   seconds of load (default 60)
 *   --sessions   concurrent synthetic sessions (default 10)
 *   --rate       total events per minute across all sessions (default 1000)
 *   --threshold  p95 budget in ms (default 2000, SC-001)
 *
 * Setup mirrors a real user: GET /auth/session → register a throw-away project → install hooks
 * with explicit confirmation → read the generated X-Nexora-Hook-Token. The synthetic sessions
 * (ids "loadtest-<run>-<n>") stay in that server's history; run against a scratch data dir
 * (NEXORA_DATA_DIR) to keep your real one clean. Exits 1 when p95 > threshold or events are lost.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import {
  type ClientToServerEvents,
  CSRF_HEADER,
  HOOK_TOKEN_HEADER,
  LIVE_NAMESPACE,
  type ServerToClientEvents,
  SOCKET_PATH,
  type SubscribeAck,
} from "@nexora/contracts";
import { io, type Socket } from "socket.io-client";

const say = (m: string) => process.stdout.write(`[load-test] ${m}\n`);

function positive(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number`);
  return n;
}

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:3022" },
    duration: { type: "string", default: "60" },
    sessions: { type: "string", default: "10" },
    rate: { type: "string", default: "1000" },
    threshold: { type: "string", default: "2000" },
  },
});
const BASE = args.url.replace(/\/+$/, "");
const DURATION_MS = positive("duration", args.duration) * 1000;
const SESSIONS = Math.round(positive("sessions", args.sessions));
const RATE_PER_MIN = positive("rate", args.rate);
const THRESHOLD_MS = positive("threshold", args.threshold);
/** after the last send, how long to wait for stragglers before counting them lost */
const DRAIN_MS = 10_000;

const RUN = Date.now().toString(36);
const MARKER = `nexora-load-test ${RUN}`;

// ---- HTTP with the loopback session cookie ----

let cookieHeader = "";
let csrf = "";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      cookie: cookieHeader,
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function login(): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/auth/session`);
  if (!res.ok) throw new Error(`GET /auth/session → ${res.status} (is the server running?)`);
  const pairs = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
  cookieHeader = pairs.join("; ");
  csrf = pairs.find((p) => p.startsWith("nexora_csrf="))?.slice("nexora_csrf=".length) ?? "";
  if (!csrf) throw new Error("server did not issue a csrf cookie (remote mode is not supported)");
}

interface Setup {
  projectId: string;
  root: string;
  token: string;
}

async function setupProject(): Promise<Setup> {
  const root = mkdtempSync(join(tmpdir(), "nexora-load-test-"));
  const project = await api<{ id: string }>("POST", "/projects", {
    rootPath: root,
    name: basename(root),
  });
  await api("POST", `/projects/${project.id}/hooks/install`, { confirm: true });
  const settings = JSON.parse(
    readFileSync(join(root, ".claude", "settings.local.json"), "utf8"),
  ) as { hooks: Record<string, Array<{ hooks: Array<{ headers: Record<string, string> }> }>> };
  const token = settings.hooks.PreToolUse?.[0]?.hooks[0]?.headers[HOOK_TOKEN_HEADER];
  if (!token) throw new Error("hook token not found in .claude/settings.local.json");
  return { projectId: project.id, root, token };
}

// ---- live socket, subscribed like the dashboard ----

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function connectLive(onSummary: (summary: string, at: number) => void): Promise<LiveSocket> {
  const socket: LiveSocket = io(`${BASE}${LIVE_NAMESPACE}`, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    extraHeaders: { cookie: cookieHeader },
    reconnection: false,
  });
  socket.on("event", (batch) => {
    const at = performance.now();
    for (const e of batch.events) onSummary(e.summary, at);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err) => reject(new Error(`socket: ${err.message}`)));
  });
  const ack = await new Promise<SubscribeAck>((resolve) =>
    socket.emit("subscribe", { scope: "global" }, resolve),
  );
  if (!ack.ok) throw new Error(`subscribe failed: ${ack.error ?? "unknown"}`);
  return socket;
}

// ---- load ----

const sentAt = new Map<string, number>();
const latencies: number[] = [];
const ingestMs: number[] = [];
let httpErrors = 0;

function hookBody(session: number, seq: number, root: string, event: string) {
  const sessionId = `loadtest-${RUN}-${session}`;
  if (event !== "PreToolUse") return { session_id: sessionId, hook_event_name: event, cwd: root };
  return {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    cwd: root,
    tool_name: "Bash",
    tool_input: { command: `${MARKER} ${session}-${seq}` },
    tool_use_id: `toolu_${RUN}_${session}_${seq}`,
  };
}

async function post(token: string, body: unknown): Promise<void> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/api/v1/hooks/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", [HOOK_TOKEN_HEADER]: token },
      body: JSON.stringify(body),
    });
    await res.arrayBuffer();
    if (!res.ok) httpErrors++;
  } catch {
    httpErrors++;
  }
  ingestMs.push(performance.now() - t0);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)]!;
}

const ms = (n: number) => (Number.isNaN(n) ? "n/a" : `${n.toFixed(1)} ms`);

async function run(): Promise<number> {
  say(
    `target ${BASE} · ${SESSIONS} sessions · ${RATE_PER_MIN} events/min · ${DURATION_MS / 1000}s`,
  );
  await login();
  const setup = await setupProject();
  say(`project ${setup.projectId} registered at ${setup.root}`);

  const socket = await connectLive((summary, at) => {
    const key = summary.startsWith(`Bash: ${MARKER} `) ? summary.slice(`Bash: `.length) : null;
    if (key === null) return;
    const t0 = sentAt.get(key);
    if (t0 === undefined) return;
    sentAt.delete(key);
    latencies.push(at - t0);
  });

  // every session opens with a prompt so the session row exists before tool traffic
  await Promise.all(
    Array.from({ length: SESSIONS }, (_, s) =>
      post(setup.token, hookBody(s, 0, setup.root, "UserPromptSubmit")),
    ),
  );

  const perSessionInterval = (SESSIONS * 60_000) / RATE_PER_MIN;
  const inflight = new Set<Promise<void>>();
  const timers: NodeJS.Timeout[] = [];
  let sent = 0;
  const start = performance.now();

  await new Promise<void>((resolve) => {
    for (let s = 0; s < SESSIONS; s++) {
      let seq = 0;
      const tick = () => {
        if (performance.now() - start >= DURATION_MS) return;
        seq++;
        const body = hookBody(s, seq, setup.root, "PreToolUse");
        sentAt.set(`${MARKER} ${s}-${seq}`, performance.now());
        sent++;
        const p = post(setup.token, body).finally(() => inflight.delete(p));
        inflight.add(p);
      };
      // stagger sessions evenly across one interval so the load is smooth, not bursty
      const offset = (perSessionInterval / SESSIONS) * s;
      timers.push(
        setTimeout(() => {
          tick();
          timers.push(setInterval(tick, perSessionInterval));
        }, offset),
      );
    }
    setTimeout(resolve, DURATION_MS);
  });
  for (const t of timers) clearInterval(t);
  await Promise.all(inflight);
  const elapsed = performance.now() - start;

  const drainUntil = performance.now() + DRAIN_MS;
  while (sentAt.size > 0 && performance.now() < drainUntil) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const lost = sentAt.size;

  await Promise.all(
    Array.from({ length: SESSIONS }, (_, s) =>
      post(setup.token, hookBody(s, 0, setup.root, "SessionEnd")),
    ),
  );
  socket.close();
  await api("DELETE", `/projects/${setup.projectId}/hooks`).catch(() => undefined);
  rmSync(setup.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  const sorted = [...latencies].sort((a, b) => a - b);
  const ingestSorted = [...ingestMs].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  say(`sent ${sent} events in ${(elapsed / 1000).toFixed(1)}s`);
  say(`achieved rate ${((sent / elapsed) * 60_000).toFixed(0)} events/min`);
  say(`received ${latencies.length} · lost ${lost} · http errors ${httpErrors}`);
  say(
    `ingest → socket latency  p50 ${ms(percentile(sorted, 50))}  p95 ${ms(p95)}  max ${ms(sorted.at(-1) ?? Number.NaN)}`,
  );
  say(
    `POST /hooks/ingest       p50 ${ms(percentile(ingestSorted, 50))}  p95 ${ms(percentile(ingestSorted, 95))}  max ${ms(ingestSorted.at(-1) ?? Number.NaN)}`,
  );

  const ok = !Number.isNaN(p95) && p95 <= THRESHOLD_MS && lost === 0 && httpErrors === 0;
  say(ok ? `PASS (p95 ≤ ${THRESHOLD_MS} ms, SC-001)` : `FAIL (budget p95 ≤ ${THRESHOLD_MS} ms)`);
  return ok ? 0 : 1;
}

run()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(`[load-test] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
