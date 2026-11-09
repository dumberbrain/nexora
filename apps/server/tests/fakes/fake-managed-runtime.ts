/**
 * Test-only ManagedRuntime double: no model, no network, no processes. Sessions finish only when
 * a test calls `finish()`, so every state transition is driven explicitly.
 */
import {
  type ExecutionMode,
  type RuntimeCapabilityProfile,
  type RuntimeEnvironment,
  type RuntimeKind,
} from "@nexora/contracts";

import {
  type ApprovalGate,
  CapabilityUnsupportedError,
  type ManagedRuntime,
  type SessionHandle,
  type SessionOutcome,
  type SessionResult,
  type StartSessionInput,
} from "../../src/modules/runtime-manager/runtime-adapter";
import { type SessionRepository } from "../../src/modules/session-manager/session.repository";

export type StartInput = StartSessionInput & {
  executionMode: ExecutionMode;
  runtime?: RuntimeKind;
  idleTimeoutMs: number;
  turnTimeoutMs: number;
};

export function capabilityProfile(
  overrides: Partial<RuntimeCapabilityProfile> = {},
): RuntimeCapabilityProfile {
  return {
    runtime: "agent_sdk",
    canStart: true,
    canStop: true,
    canInterrupt: true,
    canPause: false,
    canResume: true,
    canRestart: true,
    canSendMessage: "yes",
    canSetPermissionMode: true,
    emitsEvents: ["session.started", "session.stopped", "tool.invoked"],
    reportsUsage: "estimate",
    notes: [],
    ...overrides,
  };
}

export function fakeEnvironment(opts: { agentTeams?: boolean } = {}): RuntimeEnvironment {
  return {
    claude: { installed: true, version: "2.1.319", authenticated: null, reason: null },
    agentTeams: {
      enabled: opts.agentTeams ?? false,
      detail: opts.agentTeams ? "process env" : "set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1",
    },
    runtimes: [
      { kind: "agent_sdk", available: true, reason: null, capabilities: capabilityProfile() },
      {
        kind: "cli_headless",
        available: true,
        reason: null,
        capabilities: capabilityProfile({ runtime: "cli_headless", canInterrupt: false }),
      },
      {
        kind: "agent_team_pty",
        available: opts.agentTeams ?? false,
        reason: opts.agentTeams ? null : "Agent Teams flag not set",
        capabilities: capabilityProfile({ runtime: "agent_team_pty", canSendMessage: "lead_only" }),
      },
    ],
  };
}

/**
 * One fake session. `done` is per turn like the real adapters: a message sent after the turn
 * ended (e.g. after an interrupt) opens a new turn.
 */
export class FakeSession implements SessionHandle {
  readonly kind: RuntimeKind;
  private readonly waitingListeners = new Set<(waiting: boolean) => void>();
  readonly sessionId: Promise<string>;
  readonly sent: string[] = [];
  stopped = false;
  interrupts = 0;
  private turn!: Promise<SessionResult>;
  private resolveDone!: (r: SessionResult) => void;
  private settled = false;

  constructor(
    readonly id: string,
    readonly input: StartInput,
    readonly approvals: ApprovalGate,
    readonly onTurnTimeout: ((info: { sessionId: string; taskId: string | null }) => void) | null,
    private readonly sendSupported: boolean,
    private readonly owner: FakeManagedRuntime | null = null,
  ) {
    this.kind = input.runtime ?? "agent_sdk";
    this.sessionId = Promise.resolve(id);
    this.openTurn();
  }

  onWaitingForInput(listener: (waiting: boolean) => void): () => void {
    this.waitingListeners.add(listener);
    return () => this.waitingListeners.delete(listener);
  }

  /** an interactive lead shows (true) / leaves (false) a start-up dialog */
  setWaiting(waiting: boolean): void {
    for (const l of [...this.waitingListeners]) l(waiting);
  }

  get done(): Promise<SessionResult> {
    return this.turn;
  }

  finish(outcome: SessionOutcome, resultText: string | null = "done", error: string | null = null) {
    if (this.settled) return;
    this.settled = true;
    this.resolveDone({ outcome, sessionId: this.id, resultText, usage: null, error });
  }

  stop(): Promise<void> {
    this.stopped = true;
    if (this.owner?.hangStop) return new Promise<void>(() => undefined);
    this.finish("stopped", null);
    this.owner?.patchRow(this.id, { status: "stopped", endedAt: Date.now() });
    return Promise.resolve();
  }

  interrupt(): Promise<void> {
    this.interrupts += 1;
    this.finish("interrupted", null);
    return Promise.resolve();
  }

  sendMessage(text: string): Promise<void> {
    if (!this.sendSupported) throw new CapabilityUnsupportedError(this.kind, "sendMessage");
    if (this.stopped) return Promise.reject(new Error("session is stopped"));
    this.sent.push(text);
    if (this.settled) this.openTurn();
    return Promise.resolve();
  }

  private openTurn(): void {
    this.settled = false;
    this.turn = new Promise((resolve) => (this.resolveDone = resolve));
  }

  setPermissionMode(): Promise<void> {
    return Promise.resolve();
  }
}

export class FakeManagedRuntime implements ManagedRuntime {
  readonly sessions: FakeSession[] = [];
  readonly queries: { cwd: string; prompt: string }[] = [];
  /** scripted readOnlyQuery replies, consumed in order (default: "{}") */
  replies: string[] = [];
  env: RuntimeEnvironment = fakeEnvironment();
  sendSupported = true;
  failNextStart: Error | null = null;
  /** when set, every started session gets a session row (like RuntimeManager) */
  rows: Pick<SessionRepository, "get" | "insert" | "update"> | null = null;
  /** capabilities written to those rows */
  rowCapabilities: RuntimeCapabilityProfile = capabilityProfile();
  /** stop() never resolves (a hung runtime) */
  hangStop = false;
  private seq = 0;

  environment(): Promise<RuntimeEnvironment> {
    return Promise.resolve(this.env);
  }

  startManagedSession(
    input: StartInput,
    deps: {
      approvals: ApprovalGate;
      onTurnTimeout?: (info: { sessionId: string; taskId: string | null }) => void;
    },
  ): Promise<SessionHandle> {
    if (this.failNextStart) {
      const err = this.failNextStart;
      this.failNextStart = null;
      return Promise.reject(err);
    }
    this.seq += 1;
    const id = `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
    const s = new FakeSession(
      id,
      input,
      deps.approvals,
      deps.onTurnTimeout ?? null,
      this.sendSupported,
      this,
    );
    this.sessions.push(s);
    if (this.rows) {
      const ts = Date.now();
      this.rows.insert({
        id,
        executionId: input.executionId,
        executionMode: input.executionMode,
        currentTaskId: input.taskId,
        projectId: null,
        runtime: this.rowCapabilities.runtime,
        observeOnly: false,
        cwd: input.cwd,
        gitBranch: null,
        worktreePath: input.cwd,
        model: null,
        status: "running",
        capabilities: this.rowCapabilities,
        pid: null,
        usage: null,
        lastActivityAt: ts,
        startedAt: ts,
        endedAt: null,
      });
    }
    return Promise.resolve(s);
  }

  readOnlyQuery(input: { cwd: string; prompt: string }) {
    this.queries.push({ cwd: input.cwd, prompt: input.prompt });
    return Promise.resolve({ text: this.replies.shift() ?? "{}", usage: null });
  }

  getHandle(sessionId: string): SessionHandle | undefined {
    return this.sessions.find((s) => s.id === sessionId);
  }

  stopAll(): Promise<void> {
    return Promise.all(this.sessions.map((s) => s.stop())).then(() => undefined);
  }

  patchRow(id: string, patch: Parameters<SessionRepository["update"]>[1]): void {
    if (this.rows?.get(id)) this.rows.update(id, patch);
  }

  /** the session started for a task (latest attempt) */
  sessionFor(taskId: string | null): FakeSession | undefined {
    return [...this.sessions].reverse().find((s) => s.input.taskId === taskId);
  }
}
