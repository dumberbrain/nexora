import { type Server as HttpServer } from "node:http";

import {
  type ClientToServerEvents,
  type EntityChanged,
  EVENT_BATCH_MS,
  LIVE_NAMESPACE,
  MAX_REPLAY_EVENTS,
  type NexoraEvent,
  roomOf,
  type ServerToClientEvents,
  SOCKET_PATH,
  type Stats,
  SubscribePayloadSchema,
  type SubscribeScope,
  UnsubscribePayloadSchema,
} from "@nexora/contracts";
import { Server, type Socket } from "socket.io";

import { type ApiTokenVerifier, bearerToken } from "../http/middleware/bearer-auth";
import { checkHostOrigin, type OriginPolicy } from "../http/middleware/origin-guard";
import { SESSION_COOKIE, safeEqual, type SessionKeys } from "../http/middleware/session-cookie";
import { type EventBus, type EventStore, type ReplayScope } from "../modules/event-manager";

export interface GatewayOptions {
  httpServer: HttpServer;
  store: EventStore;
  bus: EventBus;
  keys: SessionKeys;
  policy: OriginPolicy;
  envToken: string | undefined;
  verifyApiToken?: ApiTokenVerifier;
  batchMs?: number;
  maxReplay?: number;
}

export interface Gateway {
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  publishStats(stats: Stats): void;
  close(): Promise<void>;
}

const REPLAY_CHUNK = 500;

/** What socketAuth stores on `socket.data`. */
export interface SocketAuthData {
  actor?: string;
  /** API-token scope; absent for the session cookie and the env token (full access) */
  scope?: "read" | "control";
}

export type SocketAuthOptions = Pick<GatewayOptions, "keys" | "envToken" | "verifyApiToken">;

/**
 * Handshake auth shared by every namespace (/live, /terminal): a bearer token (env token or API
 * token) or the loopback session cookie. Sets `socket.data.actor` for auditing.
 */
export function socketAuth(
  opts: SocketAuthOptions,
): (
  socket: { handshake: Socket["handshake"]; data: unknown },
  next: (err?: Error) => void,
) => void {
  return (socket, next) => {
    const data = socket.data as SocketAuthData;
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const token =
      (typeof auth?.token === "string" ? auth.token : undefined) ??
      bearerToken(socket.handshake.headers.authorization);
    if (token) {
      if (opts.envToken && safeEqual(token, opts.envToken)) {
        data.actor = "user";
        return next();
      }
      const api = opts.verifyApiToken?.(token);
      if (api) {
        data.actor = `mcp_client:${api.name}`;
        data.scope = api.scope;
        return next();
      }
      return next(new Error("auth: invalid token"));
    }
    const cookie = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    if (safeEqual(cookie, opts.keys.session)) {
      data.actor = "user";
      return next();
    }
    return next(new Error("auth: session required"));
  };
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Rooms an event belongs to. */
function roomsFor(e: NexoraEvent): string[] {
  const rooms = ["global"];
  if (e.executionId) rooms.push(roomOf("execution", e.executionId));
  if (e.sessionId) rooms.push(roomOf("session", e.sessionId));
  if (e.agentId) rooms.push(roomOf("agent", e.agentId));
  return rooms;
}

function scopeFilter(scope: SubscribeScope, id: string | undefined): ReplayScope {
  if (id === undefined) return {};
  if (scope === "execution") return { executionId: id };
  if (scope === "session") return { sessionId: id };
  if (scope === "agent") return { agentId: id };
  return {};
}

/**
 * Socket.IO namespace /live (contracts/socket-events.md): authenticated handshake (session cookie
 * or bearer), Host/Origin check, rooms per scope, cursor replay with gap detection, and per-room
 * batching of live events.
 */
export function createGateway(opts: GatewayOptions): Gateway {
  const batchMs = opts.batchMs ?? EVENT_BATCH_MS;
  const maxReplay = opts.maxReplay ?? MAX_REPLAY_EVENTS;

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(opts.httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    // WebSockets bypass CORS — enforce Host/Origin ourselves before the upgrade
    allowRequest: (req, cb) => {
      const reason = checkHostOrigin(opts.policy, req.headers.host, req.headers.origin);
      cb(reason, reason === null);
    },
  });
  const live = io.of(LIVE_NAMESPACE);

  live.use(socketAuth(opts));

  live.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    socket.on("subscribe", (raw, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const parsed = SubscribePayloadSchema.safeParse(raw);
      if (!parsed.success) {
        reply({ ok: false, replayed: 0, gap: false, error: parsed.error.issues[0]?.message });
        return;
      }
      const { scope, id, sinceEventId } = parsed.data;
      void socket.join(roomOf(scope, id));

      let replayed = 0;
      let gap = false;
      let lastEventId: string | null = sinceEventId ?? null;
      if (sinceEventId) {
        const missed = opts.store.since(
          { afterId: sinceEventId, ...scopeFilter(scope, id) },
          maxReplay + 1,
        );
        if (missed.length > maxReplay) {
          gap = true; // client refetches lists via REST instead of a partial replay
        } else {
          for (let i = 0; i < missed.length; i += REPLAY_CHUNK) {
            socket.emit("event", { events: missed.slice(i, i + REPLAY_CHUNK) });
          }
          replayed = missed.length;
          lastEventId = missed.at(-1)?.id ?? lastEventId;
        }
      }
      socket.emit("replay.done", { scope, ...(id ? { id } : {}), lastEventId });
      reply({ ok: true, replayed, gap });
    });

    socket.on("unsubscribe", (raw, ack) => {
      const parsed = UnsubscribePayloadSchema.safeParse(raw);
      if (parsed.success) void socket.leave(roomOf(parsed.data.scope, parsed.data.id));
      if (typeof ack === "function") ack({ ok: parsed.success });
    });
  });

  // ---- live batching ----
  const pending = new Map<string, NexoraEvent[]>();
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    timer = undefined;
    for (const [room, events] of pending) live.to(room).emit("event", { events });
    pending.clear();
  };
  const offEvent = opts.bus.onEvent((e) => {
    for (const room of roomsFor(e)) {
      const list = pending.get(room);
      if (list) list.push(e);
      else pending.set(room, [e]);
    }
    timer ??= setTimeout(flush, batchMs);
  });

  const offEntity = opts.bus.onEntityChanged((change: EntityChanged) => {
    const rooms = ["global"];
    if (change.kind === "session" || change.kind === "execution" || change.kind === "agent") {
      rooms.push(roomOf(change.kind, change.id));
    }
    live.to(rooms).emit("entity.changed", change);
  });

  return {
    io,
    publishStats: (stats) => {
      live.to("global").emit("stats", stats);
    },
    close: async () => {
      offEvent();
      offEntity();
      if (timer) clearTimeout(timer);
      await io.close();
    },
  };
}
