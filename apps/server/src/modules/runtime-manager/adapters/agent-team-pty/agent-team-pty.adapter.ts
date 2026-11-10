import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import { type RuntimeCapabilityProfile, type TeamView } from "@ubuliera/contracts";

import { TeamFilesWatcher, TeamState, type TeamAgentSink } from "./team-files-watcher";
import { resolveExecutable, runCommand } from "../../../../lib/process";
import { AGENT_TEAM_PTY_CAPABILITIES } from "../../capabilities";
import { AGENT_TEAMS_FLAG } from "../../environment";
import {
  CapabilityUnsupportedError,
  type RuntimeAdapter,
  type RuntimeDeps,
  type RuntimeDetection,
  type SessionHandle,
  type StartSessionInput,
} from "../../runtime-adapter";
import { assertSessionCwd } from "../session-cwd";
import { TurnTracker } from "../turn-tracker";

/* ---------- the slice of node-pty this adapter uses (node-pty@1.1.0, loaded lazily) ---------- */

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export interface PtyProcess {
  readonly pid: number;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtyModule {
  spawn(file: string, args: string[], opts: PtySpawnOptions): PtyProcess;
}

/** Terminal of one Ubuliera-started lead, for the /terminal gateway (T139). */
export interface TerminalChannel {
  /** recent output (bounded) so a late viewer sees the current screen */
  backlog(): string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onOutput(listener: (data: string) => void): () => void;
  onExit(listener: (exitCode: number | null) => void): () => void;
  readonly exited: boolean;
}

export interface AgentTeamPtyAdapterOptions {
  /** default: `import("node-pty")` — a failure makes the runtime unavailable (observe-only) */
  loadPty?: () => Promise<PtyModule>;
  /** absolute path of the claude binary; default resolveExecutable("claude") */
  claudePath?: () => string;
  /** default: `claude --version` */
  version?: () => Promise<string>;
  /** default: ~/.claude (read-only) */
  claudeHome?: string;
  /** environment the child is derived from (default process.env) */
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Windows process-tree kill (pty.kill throws "AttachConsole failed" there) */
  killTree?: (pid: number) => Promise<void>;
  /** team-file polling interval, default 1500 ms; 0 = only on refreshTeam() */
  pollIntervalMs?: number;
  /** output backlog kept per session, in characters (default 256 KiB) */
  backlogChars?: number;
  /** Claude session id passed as `--session-id` (default randomUUID) */
  newSessionId?: () => string;
  /** where team_lead/teammate agents are persisted */
  agents?: TeamAgentSink;
  cols?: number;
  rows?: number;
  now?: () => number;
}

const DEFAULT_BACKLOG = 256 * 1024;
const SCREEN_WINDOW = 8 * 1024;
const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const CTRL_C = "\x03";

/** Start-up dialogs that need a human answer (S2): never answered by Ubuliera. */
const DIALOGS: { dialog: string; re: RegExp }[] = [
  {
    dialog: "workspace_trust",
    re: /Do you trust the files in this folder|Yes, I trust this folder/gi,
  },
  { dialog: "mcp_servers", re: /New MCP servers? found/gi },
];
/** The input box is ready: the footer of the prompt (mode indicator or shortcuts hint). */
const READY = /\? for shortcuts|accept edits on|plan mode on|bypass permissions on/gi;

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s: string) => s.replace(ANSI, "");

function lastIndex(re: RegExp, s: string): number {
  let at = -1;
  re.lastIndex = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) at = m.index;
  return at;
}

/**
 * Child environment: every `CLAUDECODE*` / `CLAUDE_CODE_*` marker inherited from a parent Claude
 * Code session is dropped (e.g. CLAUDE_CODE_CHILD_SESSION turns transcripts off — S2), then the
 * Agent Teams flag is set.
 */
export function childEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (/^CLAUDECODE/i.test(k) || /^CLAUDE_CODE_/i.test(k)) continue;
    out[k] = v;
  }
  out[AGENT_TEAMS_FLAG] = "1";
  return out;
}

/** `claude` interactive arguments (no `-p`: Agent Teams are not available headless — R3). */
export function ptyArgs(input: StartSessionInput, sessionId: string): string[] {
  const args = ["--session-id", sessionId, "--permission-mode", input.permissionMode];
  if (input.model !== undefined) args.push("--model", input.model);
  if (input.allowedTools?.length) args.push("--allowedTools", input.allowedTools.join(","));
  if (input.disallowedTools?.length) {
    args.push("--disallowedTools", input.disallowedTools.join(","));
  }
  return args;
}

/** `taskkill /T /F /PID <pid>` by absolute path, argument array, no shell. */
export function windowsKillTree(pid: number): Promise<void> {
  const exe = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
  return new Promise((resolve) => {
    execFile(exe, ["/T", "/F", "/PID", String(pid)], { windowsHide: true, timeout: 10_000 }, () =>
      resolve(),
    );
  });
}

async function defaultLoadPty(): Promise<PtyModule> {
  const mod = (await import("node-pty")) as unknown as PtyModule & { default?: PtyModule };
  const pty = typeof mod.spawn === "function" ? mod : mod.default;
  if (!pty || typeof pty.spawn !== "function") throw new Error("node-pty has no spawn()");
  return pty;
}

async function defaultVersion(): Promise<string> {
  return (await runCommand("claude", ["--version"], { timeoutMs: 15_000 })).stdout.trim();
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface LeadSession {
  pty: PtyProcess;
  state: TeamState;
  watcher: TeamFilesWatcher;
  backlog: string;
  output: Set<(data: string) => void>;
  exits: Set<(code: number | null) => void>;
  waitingListeners: Set<(waiting: boolean) => void>;
  waiting: boolean;
  exited: boolean;
  /** called after each hook / poll: settles the turn once the team finished */
  check(): void;
}

/**
 * Agent Teams runtime (T137, research R3 + S2): the team lead is an INTERACTIVE `claude` process
 * in a pseudo-terminal — Agent Teams do not exist in `-p` or SDK sessions. Ubuliera types the
 * initial prompt once the input box is ready, never answers start-up dialogs (workspace trust
 * defaults to "No, exit"; the session waits for the user in the terminal), observes the team
 * through hooks and read-only team files, and stops the process tree on demand. Never emulated
 * with subagents (FR-011). When node-pty cannot load, the runtime is unavailable and Agent Teams
 * can only be observed (the user starts the lead in their own terminal).
 */
export class AgentTeamPtyAdapter implements RuntimeAdapter {
  readonly kind = "agent_team_pty" as const;
  private ptyModule: Promise<PtyModule> | null = null;
  private readonly sessions = new Map<string, LeadSession>();
  private readonly platform: NodeJS.Platform;
  private readonly now: () => number;

  constructor(private readonly opts: AgentTeamPtyAdapterOptions = {}) {
    this.platform = opts.platform ?? process.platform;
    this.now = opts.now ?? Date.now;
  }

  capabilities(): RuntimeCapabilityProfile {
    return AGENT_TEAM_PTY_CAPABILITIES;
  }

  async detect(): Promise<RuntimeDetection> {
    try {
      await this.pty();
    } catch (err) {
      return { available: false, version: null, reason: this.unavailableReason(err) };
    }
    try {
      const version = (await (this.opts.version ?? defaultVersion)()).trim();
      return { available: true, version: version || null, reason: null };
    } catch (err) {
      return {
        available: false,
        version: null,
        reason: `claude CLI not available: ${errorText(err)}`,
      };
    }
  }

  async start(input: StartSessionInput, deps: RuntimeDeps): Promise<SessionHandle> {
    assertSessionCwd(input);
    if (input.resumeSessionId !== undefined) {
      // in-process teammates are not restored on resume (R3)
      throw new CapabilityUnsupportedError("agent_team_pty", "resume");
    }
    let ptyModule: PtyModule;
    try {
      ptyModule = await this.pty();
    } catch (err) {
      throw new Error(this.unavailableReason(err));
    }
    const sessionId = (this.opts.newSessionId ?? randomUUID)();
    const file = (this.opts.claudePath ?? (() => resolveExecutable("claude")))();
    const pty = ptyModule.spawn(file, ptyArgs(input, sessionId), {
      name: "xterm-256color",
      cols: this.opts.cols ?? 120,
      rows: this.opts.rows ?? 32,
      cwd: input.cwd,
      env: childEnv(this.opts.env ?? process.env),
    });

    const ctx = { executionId: input.executionId, taskId: input.taskId };
    const turns = new TurnTracker();
    let ending: "stopped" | null = null;
    const backlogMax = this.opts.backlogChars ?? DEFAULT_BACKLOG;
    const state = new TeamState({ sessionId, ...ctx }, deps.sink, this.opts.agents, this.now);
    const lead: LeadSession = {
      pty,
      state,
      watcher: new TeamFilesWatcher({
        claudeHome: this.opts.claudeHome ?? path.join(homedir(), ".claude"),
        pid: pty.pid,
        state,
        intervalMs: this.opts.pollIntervalMs ?? 1500,
        onPolled: () => lead.check(),
      }),
      backlog: "",
      output: new Set(),
      exits: new Set(),
      waitingListeners: new Set(),
      waiting: false,
      exited: false,
      check: () => {
        const finished = state.finished();
        if (!finished || !turns.open) return;
        turns.settle({
          outcome: "completed",
          sessionId,
          resultText: finished.resultText,
          usage: null,
          error: null,
        });
        emit("agent.waiting", "info", "Team lead finished; no teammates left", {
          outcome: "completed",
        });
      },
    };
    this.sessions.set(sessionId, lead);

    const emit = (
      type: "session.started" | "session.stopped" | "agent.waiting" | "error",
      severity: "info" | "warn" | "error",
      summary: string,
      payload: Record<string, unknown>,
    ) =>
      deps.sink.emit({
        type,
        source: "orchestrator",
        reliability: "authoritative",
        severity,
        ...ctx,
        sessionId,
        agentId: null,
        summary,
        payload,
      });

    // ---- typed input: the prompt (once) and queued messages, only when the input box is ready
    let screen = "";
    let ready = false;
    let promptSent = false;
    const queue: string[] = [];
    const type = (text: string) => {
      pty.write(`${PASTE_START}${text}${PASTE_END}`);
      pty.write("\r");
    };
    const flush = () => {
      if (!ready || ending || lead.exited) return;
      if (!promptSent) {
        promptSent = true;
        type(input.prompt);
      }
      while (queue.length > 0) type(queue.shift() as string);
    };
    const setWaiting = (waiting: boolean, dialog: string | null) => {
      if (lead.waiting === waiting) return;
      lead.waiting = waiting;
      if (waiting) {
        emit(
          "agent.waiting",
          "warn",
          "Claude Code asks a start-up question — answer it in the lead's terminal",
          { reason: "startup_dialog", dialog },
        );
      }
      for (const l of [...lead.waitingListeners]) l(waiting);
    };
    const inspect = (chunk: string) => {
      screen = (screen + stripAnsi(chunk)).slice(-SCREEN_WINDOW);
      let dialogAt = -1;
      let dialog: string | null = null;
      for (const d of DIALOGS) {
        const at = lastIndex(d.re, screen);
        if (at > dialogAt) {
          dialogAt = at;
          dialog = d.dialog;
        }
      }
      const readyAt = lastIndex(READY, screen);
      if (dialogAt > readyAt) {
        ready = false;
        setWaiting(true, dialog);
      } else if (readyAt >= 0) {
        ready = true;
        setWaiting(false, null);
        flush();
      }
    };

    pty.onData((data) => {
      lead.backlog = (lead.backlog + data).slice(-backlogMax);
      for (const l of [...lead.output]) l(data);
      inspect(data);
    });
    pty.onExit(({ exitCode }) => {
      lead.exited = true;
      lead.watcher.stop();
      for (const l of [...lead.exits]) l(exitCode);
      if (ending) return;
      this.sessions.delete(sessionId);
      turns.settle({
        outcome: exitCode === 0 ? "completed" : "failed",
        sessionId,
        resultText: null,
        usage: null,
        error: exitCode === 0 ? null : `claude exited with code ${exitCode}`,
      });
      emit("session.stopped", exitCode === 0 ? "info" : "error", `Team lead exited (${exitCode})`, {
        reason: "exited",
        exitCode,
      });
    });

    deps.onSessionId?.(sessionId, { model: input.model ?? null, cwd: input.cwd });
    emit("session.started", "info", "Agent Teams lead started in a terminal", {
      runtime: "agent_team_pty",
      pid: pty.pid,
    });
    lead.watcher.start();

    const unsupported = (capability: string) =>
      Promise.reject(new CapabilityUnsupportedError("agent_team_pty", capability));
    const gone = () => ending !== null || lead.exited;

    const handle: SessionHandle = {
      kind: "agent_team_pty",
      sessionId: Promise.resolve(sessionId),
      get done() {
        return turns.current;
      },
      stop: async () => {
        if (ending) return;
        ending = "stopped";
        lead.watcher.stop();
        this.sessions.delete(sessionId);
        turns.settle({ outcome: "stopped", sessionId, resultText: null, usage: null, error: null });
        if (!lead.exited) {
          if (this.platform === "win32") {
            await (this.opts.killTree ?? windowsKillTree)(pty.pid);
          } else {
            try {
              pty.kill();
            } catch {
              /* already gone */
            }
          }
        }
        emit("session.stopped", "info", "Team lead stopped by Ubuliera", { reason: "stopped" });
      },
      interrupt: () => {
        if (gone()) return Promise.reject(new Error("session is stopped"));
        pty.write(CTRL_C);
        return Promise.resolve();
      },
      sendMessage: (text) => {
        if (gone()) return Promise.reject(new Error("session is stopped"));
        turns.next();
        queue.push(text);
        flush();
        return Promise.resolve();
      },
      setPermissionMode: () => unsupported("setPermissionMode"),
      onWaitingForInput: (listener) => {
        lead.waitingListeners.add(listener);
        return () => lead.waitingListeners.delete(listener);
      },
    };
    return handle;
  }

  /** True while the lead runs and was started by this adapter. */
  isLeadSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** A start-up dialog waits for the user's answer in the terminal. */
  isWaitingForInput(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.waiting ?? false;
  }

  onWaitingChange(sessionId: string, listener: (waiting: boolean) => void): () => void {
    const s = this.sessions.get(sessionId);
    if (!s) return () => undefined;
    s.waitingListeners.add(listener);
    return () => s.waitingListeners.delete(listener);
  }

  /** Last known team of a lead session (null when unknown or not an Agent Teams lead). */
  teamView(sessionId: string): TeamView | null {
    return this.sessions.get(sessionId)?.state.view() ?? null;
  }

  /** Poll the team files now and return the fresh view. */
  async refreshTeam(sessionId: string): Promise<TeamView | null> {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    await s.watcher.poll();
    return s.state.view();
  }

  /** Hook payload for a session — ignored unless it belongs to a lead started here. */
  ingestHook(
    payload: { session_id: string; hook_event_name: string } & Record<string, unknown>,
  ): void {
    const s = this.sessions.get(payload.session_id);
    if (!s) return;
    s.state.applyHook(payload);
    s.check();
  }

  terminal(sessionId: string): TerminalChannel | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    return {
      backlog: () => s.backlog,
      write: (data) => {
        if (!s.exited) s.pty.write(data);
      },
      resize: (cols, rows) => {
        if (!s.exited) s.pty.resize(cols, rows);
      },
      onOutput: (l) => {
        s.output.add(l);
        return () => s.output.delete(l);
      },
      onExit: (l) => {
        s.exits.add(l);
        return () => s.exits.delete(l);
      },
      get exited() {
        return s.exited;
      },
    };
  }

  private pty(): Promise<PtyModule> {
    if (!this.ptyModule) {
      this.ptyModule = (this.opts.loadPty ?? defaultLoadPty)();
      this.ptyModule.catch(() => {
        this.ptyModule = null;
      });
    }
    return this.ptyModule;
  }

  private unavailableReason(err: unknown): string {
    return `node-pty could not be loaded (${errorText(err)}); Agent Teams can only be observed — start the lead in your own terminal with ${AGENT_TEAMS_FLAG}=1`;
  }
}

/** Factory the lead adds to the RuntimeManager adapter set. */
export function createAgentTeamPtyAdapter(
  opts: AgentTeamPtyAdapterOptions = {},
): AgentTeamPtyAdapter {
  return new AgentTeamPtyAdapter(opts);
}
