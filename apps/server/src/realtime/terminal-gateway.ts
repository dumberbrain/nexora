import {
  type Session,
  TERMINAL_NAMESPACE,
  type TerminalAttachAck,
  TerminalAttachSchema,
  type TerminalExit,
  TerminalInputSchema,
  type TerminalOutput,
  TerminalResizeSchema,
} from "@ubuliera/contracts";
import { type Namespace, type Server, type Socket } from "socket.io";

import { socketAuth, type SocketAuthData, type SocketAuthOptions } from "./gateway";
import { type AuditInput } from "../modules/permission-manager/audit.service";
import { type TerminalChannel } from "../modules/runtime-manager";

/** client → server events of the /terminal namespace (contracts/api/teams.ts). */
export interface TerminalClientEvents {
  "terminal:attach": (payload: unknown, ack?: (a: TerminalAttachAck) => void) => void;
  "terminal:input": (payload: unknown) => void;
  "terminal:resize": (payload: unknown) => void;
  "terminal:detach": (payload: unknown) => void;
}

/** server → client events of the /terminal namespace. */
export interface TerminalServerEvents {
  "terminal:output": (payload: TerminalOutput) => void;
  "terminal:exit": (payload: TerminalExit) => void;
}

export interface TerminalGatewayOptions {
  /** the Socket.IO server of the /live gateway (same path, same Host/Origin check) */
  io: Server;
  /** same handshake auth as /live */
  auth: SocketAuthOptions;
  /** terminals of leads THIS process started (AgentTeamPtyAdapter.terminal) */
  terminals: { terminal(sessionId: string): TerminalChannel | undefined };
  sessions: { get(id: string): Pick<Session, "id" | "runtime" | "observeOnly"> | undefined };
  audit: { record(input: AuditInput): unknown };
}

export interface TerminalGateway {
  namespace: Namespace;
  close(): void;
}

type TerminalSocket = Socket<TerminalClientEvents, TerminalServerEvents>;

interface Attachment {
  channel: TerminalChannel;
  off: (() => void)[];
}

/**
 * Socket.IO namespace `/terminal` (T139): a live view of — and keyboard into — the terminal of an
 * Agent Teams lead that Ubuliera started (runtime `agent_team_pty`). Observed sessions and other
 * runtimes are refused. Auth is the /live handshake; one audit entry per attach (not per key);
 * API tokens with `read` scope may watch but not type.
 */
export function createTerminalGateway(opts: TerminalGatewayOptions): TerminalGateway {
  const ns = opts.io.of(TERMINAL_NAMESPACE) as unknown as Namespace<
    TerminalClientEvents,
    TerminalServerEvents
  >;
  ns.use(socketAuth(opts.auth));

  const channelOf = (sessionId: string): TerminalChannel | string => {
    const session = opts.sessions.get(sessionId);
    if (!session) return "Session not found";
    if (session.runtime !== "agent_team_pty" || session.observeOnly) {
      return "Only Agent Teams leads started by Ubuliera have a terminal";
    }
    return opts.terminals.terminal(sessionId) ?? "The lead's terminal is no longer running";
  };

  ns.on("connection", (socket: TerminalSocket) => {
    const data = socket.data as SocketAuthData;
    const actor = data.actor ?? "user";
    const canType = data.scope !== "read";
    const attached = new Map<string, Attachment>();

    const detach = (sessionId: string) => {
      const a = attached.get(sessionId);
      if (!a) return;
      for (const off of a.off) off();
      attached.delete(sessionId);
    };

    socket.on("terminal:attach", (raw, ack) => {
      const reply = typeof ack === "function" ? ack : () => undefined;
      const parsed = TerminalAttachSchema.safeParse(raw);
      if (!parsed.success) {
        reply({ ok: false, error: parsed.error.issues[0]?.message ?? "invalid payload" });
        return;
      }
      const { sessionId, cols, rows } = parsed.data;
      const channel = channelOf(sessionId);
      if (typeof channel === "string") {
        opts.audit.record({
          actor,
          action: "terminal.attach",
          targetType: "session",
          targetId: sessionId,
          outcome: "denied",
          details: { reason: channel },
        });
        reply({ ok: false, error: channel });
        return;
      }
      detach(sessionId);
      const off = [
        channel.onOutput((d) => socket.emit("terminal:output", { sessionId, data: d })),
        channel.onExit((exitCode) => {
          socket.emit("terminal:exit", { sessionId, exitCode });
          detach(sessionId);
        }),
      ];
      attached.set(sessionId, { channel, off });
      if (canType) channel.resize(cols, rows);
      opts.audit.record({
        actor,
        action: "terminal.attach",
        targetType: "session",
        targetId: sessionId,
        outcome: "success",
        details: { cols, rows, input: canType },
      });
      reply({ ok: true, backlog: channel.backlog() });
      if (channel.exited) {
        socket.emit("terminal:exit", { sessionId, exitCode: null });
        detach(sessionId);
      }
    });

    socket.on("terminal:input", (raw) => {
      const parsed = TerminalInputSchema.safeParse(raw);
      if (!parsed.success || !canType) return;
      attached.get(parsed.data.sessionId)?.channel.write(parsed.data.data);
    });

    socket.on("terminal:resize", (raw) => {
      const parsed = TerminalResizeSchema.safeParse(raw);
      if (!parsed.success || !canType) return;
      attached.get(parsed.data.sessionId)?.channel.resize(parsed.data.cols, parsed.data.rows);
    });

    socket.on("terminal:detach", (raw) => {
      const id = (raw as { sessionId?: unknown } | null)?.sessionId;
      if (typeof id === "string") detach(id);
    });

    socket.on("disconnect", () => {
      for (const id of [...attached.keys()]) detach(id);
    });
  });

  return {
    namespace: ns,
    close: () => {
      ns.disconnectSockets(true);
      ns.removeAllListeners();
    },
  };
}
