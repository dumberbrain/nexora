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

export class FakeSession implements SessionHandle {
  readonly kind: RuntimeKind = "agent_sdk";
  readonly sessionId: Promise<string>;
  readonly done: Promise<SessionResult>;
  readonly sent: string[] = [];
  stopped = false;
  private resolveDone!: (r: SessionResult) => void;

  constructor(
    readonly id: string,
    readonly input: StartInput,
    readonly approvals: ApprovalGate,
    readonly onTurnTimeout: ((info: { sessionId: string; taskId: string | null }) => void) | null,
    private readonly sendSupported: boolean,
  ) {
    this.sessionId = Promise.resolve(id);
    this.done = new Promise((resolve) => (this.resolveDone = resolve));
  }

  finish(outcome: SessionOutcome, resultText: string | null = "done", error: string | null = null) {
    this.resolveDone({ outcome, sessionId: this.id, resultText, usage: null, error });
  }

  stop(): Promise<void> {
    this.stopped = true;
    this.finish("stopped", null);
    return Promise.resolve();
  }

  interrupt(): Promise<void> {
    this.finish("interrupted", null);
    return Promise.resolve();
  }

  sendMessage(text: string): Promise<void> {
    if (!this.sendSupported) throw new CapabilityUnsupportedError(this.kind, "sendMessage");
    this.sent.push(text);
    return Promise.resolve();
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
    );
    this.sessions.push(s);
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

  /** the session started for a task (latest attempt) */
  sessionFor(taskId: string | null): FakeSession | undefined {
    return [...this.sessions].reverse().find((s) => s.input.taskId === taskId);
  }
}
