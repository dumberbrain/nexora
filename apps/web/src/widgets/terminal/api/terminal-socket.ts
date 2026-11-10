import {
  SOCKET_PATH,
  TERMINAL_NAMESPACE,
  type TerminalAttach,
  type TerminalAttachAck,
  type TerminalExit,
  type TerminalInput,
  type TerminalOutput,
  type TerminalResize,
} from "@ubuliera/contracts";
import { io, type Socket } from "socket.io-client";

import { ensureSession } from "@/shared/api";

/** Typed maps of the /terminal namespace (contracts/api/teams.ts). */
interface TerminalServerEvents {
  "terminal:output": (output: TerminalOutput) => void;
  "terminal:exit": (exit: TerminalExit) => void;
}
interface TerminalClientEvents {
  "terminal:attach": (attach: TerminalAttach, ack: (ack: TerminalAttachAck) => void) => void;
  "terminal:input": (input: TerminalInput) => void;
  "terminal:resize": (resize: TerminalResize) => void;
}

export type TerminalSocket = Socket<TerminalServerEvents, TerminalClientEvents>;

/**
 * One /terminal connection per mounted terminal (same origin, session-cookie auth). Closing it
 * detaches the viewer on the server; the lead process keeps running.
 */
export function createTerminalSocket(): TerminalSocket {
  return io(TERMINAL_NAMESPACE, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

/** Connect once the session cookie exists (the namespace requires auth). */
export async function connectTerminalSocket(socket: TerminalSocket): Promise<void> {
  await ensureSession().catch(() => undefined);
  socket.connect();
}
