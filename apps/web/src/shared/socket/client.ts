import {
  type ClientToServerEvents,
  LIVE_NAMESPACE,
  type ServerToClientEvents,
  SOCKET_PATH,
} from "@ubuliera/contracts";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";

import { ensureSession } from "../api/http";

export type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

/** Root (not feature) store: connection status shown in the header. */
export const useConnectionStore = create<{ state: ConnectionState }>(() => ({
  state: "connecting",
}));

let socket: LiveSocket | null = null;

/** The single /live socket (same origin, session cookie auth). Created lazily, connected once. */
export function getLiveSocket(): LiveSocket {
  if (socket) return socket;
  const s: LiveSocket = io(LIVE_NAMESPACE, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  const set = (state: ConnectionState) => useConnectionStore.setState({ state });
  s.on("connect", () => set("connected"));
  s.on("disconnect", () => set("reconnecting"));
  s.io.on("reconnect_attempt", () => set("reconnecting"));
  s.io.on("reconnect_failed", () => set("offline"));
  s.on("connect_error", (err) => {
    set("reconnecting");
    // session cookie expired (server restart) — re-bootstrap, then let socket.io retry
    if (/auth/i.test(err.message)) void ensureSession().catch(() => set("offline"));
  });
  socket = s;
  return s;
}

/** Connect after making sure the session cookie exists. */
export async function connectLiveSocket(): Promise<LiveSocket> {
  const s = getLiveSocket();
  if (!s.connected) {
    await ensureSession().catch(() => undefined);
    s.connect();
  }
  return s;
}
