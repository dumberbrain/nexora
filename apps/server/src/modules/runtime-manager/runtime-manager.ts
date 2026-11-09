import { homedir } from "node:os";
import path from "node:path";

import {
  type RuntimeEnvironment,
  type RuntimeKind,
  type Session,
  type Usage,
  UsageSchema,
} from "@nexora/contracts";

import { cliClaudeProbe, type ClaudeProbe, detectAgentTeams, detectClaude } from "./environment";
import {
  type ApprovalGate,
  CapabilityUnsupportedError,
  type EventSink,
  type ManagedRuntime,
  type RuntimeAdapter,
  type SessionHandle,
  type ToolDecision,
  type ToolGuard,
} from "./runtime-adapter";
import { type Logger } from "../../lib/logger";
import { isInsideRoot, PathGuardError, resolveInsideRootSync } from "../../lib/path-guard";
import { type EventBus, type EventInput } from "../event-manager";
import { type AuditService } from "../permission-manager/audit.service";
import { ScopeGuard } from "../permission-manager/scope-guard";
import { type GitBranchResolver } from "../session-manager/git-branch";
import { LivenessMonitor } from "../session-manager/liveness-monitor";
import { type SessionRepository } from "../session-manager/session.repository";

export interface RuntimeManagerDeps {
  /** registered adapters; the first one is the default runtime */
  adapters: RuntimeAdapter[];
  sessions: Pick<SessionRepository, "get" | "insert" | "update">;
  projects: { findContaining(cwd: string): { id: string } | undefined };
  store: { append(e: EventInput): unknown };
  bus: EventBus;
  audit: Pick<AuditService, "record">;
  logger: Logger;
  /** default: the local `claude` CLI */
  claude?: ClaudeProbe;
  /** default: process.env */
  env?: NodeJS.ProcessEnv;
  /** default: os.homedir() */
  homeDir?: string;
  /** registered project roots, for Agent Teams flags in project settings */
  projectRoots?: () => string[];
  gitBranch?: GitBranchResolver;
  /** environment() cache, default 30 s */
  environmentTtlMs?: number;
  now?: () => number;
}

type ManagedInput = Parameters<ManagedRuntime["startManagedSession"]>[0];
type ManagedDeps = Parameters<ManagedRuntime["startManagedSession"]>[1];

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
const READ_PATH_FIELD: Record<string, string> = { Read: "file_path", Glob: "path", Grep: "path" };
/** Minimum spacing between lastActivityAt writes for one session. */
const ACTIVITY_WRITE_MS = 1000;

/** Guard for analysis/planning queries: reads inside `root`, nothing else. */
function readOnlyGuard(root: string): ToolGuard {
  return {
    check({ toolName, input }): ToolDecision {
      const field = READ_PATH_FIELD[toolName];
      if (field === undefined) {
        return { decision: "deny", reason: `${toolName} is not allowed in a read-only query` };
      }
      const raw = input[field];
      if (typeof raw !== "string" || raw === "") return { decision: "allow" };
      try {
        resolveInsideRootSync(root, path.resolve(root, raw));
        return { decision: "allow" };
      } catch {
        return { decision: "deny", reason: `${toolName} target is outside the project` };
      }
    },
  };
}

function usageFrom(payload: unknown): Usage | null {
  const raw = (payload as { usage?: unknown } | null | undefined)?.usage;
  const parsed = UsageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Runtime manager (T087): adapter registry, environment detection (`claude --version`, login
 * state, Agent Teams flag) and the {@link ManagedRuntime} the orchestrator uses — every managed
 * session gets the task scope guard, persisted events, a projected session row and liveness
 * monitoring.
 */
export class RuntimeManager implements ManagedRuntime {
  private readonly adapters = new Map<RuntimeKind, RuntimeAdapter>();
  private readonly defaultKind: RuntimeKind;
  private readonly handles = new Map<string, SessionHandle>();
  private readonly lastActivityWrite = new Map<string, number>();
  private readonly liveness: LivenessMonitor;
  private readonly now: () => number;
  private envCache: { at: number; value: Promise<RuntimeEnvironment> } | null = null;

  constructor(private readonly deps: RuntimeManagerDeps) {
    const first = deps.adapters[0];
    if (!first) throw new Error("RuntimeManager needs at least one adapter");
    this.defaultKind = first.kind;
    for (const a of deps.adapters) this.adapters.set(a.kind, a);
    this.now = deps.now ?? Date.now;
    this.liveness = new LivenessMonitor({
      bus: deps.bus,
      sessions: deps.sessions,
      events: deps.store,
      logger: deps.logger,
      now: this.now,
    });
  }

  adapter(kind: RuntimeKind = this.defaultKind): RuntimeAdapter {
    const a = this.adapters.get(kind);
    if (!a) throw new CapabilityUnsupportedError(kind, "start");
    return a;
  }

  environment(): Promise<RuntimeEnvironment> {
    const ttl = this.deps.environmentTtlMs ?? 30_000;
    const at = this.now();
    if (this.envCache && at - this.envCache.at < ttl) return this.envCache.value;
    const value = this.detect();
    this.envCache = { at, value };
    value.catch(() => (this.envCache = null));
    return value;
  }

  /** Drop the environment() cache (e.g. right after Agent Teams were enabled). */
  invalidateEnvironment(): void {
    this.envCache = null;
  }

  /** Uncached detection — never spends model usage. */
  async detect(): Promise<RuntimeEnvironment> {
    const env = this.deps.env ?? process.env;
    const [claude, runtimes] = await Promise.all([
      detectClaude(this.deps.claude ?? cliClaudeProbe, env),
      Promise.all(
        [...this.adapters.values()].map(async (a) => {
          const d = await a.detect().catch((err: unknown) => ({
            available: false,
            version: null,
            reason: err instanceof Error ? err.message : String(err),
          }));
          return {
            kind: a.kind,
            available: d.available,
            reason: d.reason,
            capabilities: a.capabilities(),
          };
        }),
      ),
    ]);
    const agentTeams = detectAgentTeams({
      env,
      homeDir: this.deps.homeDir ?? homedir(),
      projectRoots: this.deps.projectRoots?.() ?? [],
    });
    return { claude, agentTeams, runtimes };
  }

  async startManagedSession(input: ManagedInput, deps: ManagedDeps): Promise<SessionHandle> {
    const worktrees = path.join(input.projectRoot, ".nexora", "worktrees");
    if (!isInsideRoot(worktrees, input.cwd) || isInsideRoot(input.cwd, worktrees)) {
      throw new PathGuardError(`A managed session must run in a Nexora worktree: ${input.cwd}`);
    }
    const adapter = this.adapter(input.runtime ?? this.defaultKind);
    const capabilities = adapter.capabilities();
    const { sessions, bus } = this.deps;

    const patch = (id: string, p: Partial<Session>) => {
      if (!sessions.get(id)) return;
      sessions.update(id, p);
      bus.publishEntityChanged({ kind: "session", id, patch: { ...p } });
    };

    const sink: EventSink = {
      emit: (e) => {
        this.deps.store.append(e);
        if (e.sessionId) this.project(e, patch);
      },
    };

    const approvals: ApprovalGate = {
      request: async (req) => {
        const known = sessions.get(req.sessionId) !== undefined;
        if (known) {
          this.liveness.setWaiting(req.sessionId, true);
          patch(req.sessionId, { status: "waiting_for_approval" });
        }
        try {
          return await deps.approvals.request(req);
        } finally {
          if (known) {
            patch(req.sessionId, { status: "running" });
            this.liveness.setWaiting(req.sessionId, false);
          }
        }
      },
    };

    /** filled once adapter.start() returned; callbacks may run before that */
    const ref: { inner?: SessionHandle; wrapped?: SessionHandle } = {};
    const control = {
      interrupt: () => ref.inner?.interrupt() ?? Promise.resolve(),
      stop: () => ref.inner?.stop() ?? Promise.resolve(),
    };
    const onSessionId = (sessionId: string, info: { model: string | null; cwd: string }) => {
      const ts = this.now();
      const existing = sessions.get(sessionId);
      const row: Session = {
        id: sessionId,
        executionId: input.executionId,
        executionMode: input.executionMode,
        currentTaskId: input.taskId,
        projectId: this.deps.projects.findContaining(input.projectRoot)?.id ?? null,
        runtime: adapter.kind,
        observeOnly: false,
        cwd: info.cwd || input.cwd,
        gitBranch: existing?.gitBranch ?? null,
        worktreePath: input.cwd,
        model: info.model ?? existing?.model ?? null,
        status: "running",
        capabilities,
        pid: null,
        usage: existing?.usage ?? null,
        lastActivityAt: ts,
        startedAt: existing?.startedAt ?? ts,
        endedAt: null,
      };
      if (existing) {
        const { id: _id, ...rest } = row;
        sessions.update(sessionId, rest);
      } else {
        sessions.insert(row);
      }
      bus.publishEntityChanged({ kind: "session", id: sessionId, patch: { ...row } });
      this.lookupBranch(sessionId, input.cwd, input.projectRoot, patch);
      if (ref.wrapped) this.handles.set(sessionId, ref.wrapped);
      this.liveness.watch(sessionId, {
        handle: control,
        canInterrupt: capabilities.canInterrupt,
        idleTimeoutMs: input.idleTimeoutMs,
        turnTimeoutMs: input.turnTimeoutMs,
        executionId: input.executionId,
        taskId: input.taskId,
        ...(deps.onTurnTimeout ? { onTurnTimeout: deps.onTurnTimeout } : {}),
      });
      this.liveness.turnStarted(sessionId);
    };

    const {
      executionMode: _m,
      runtime: _r,
      idleTimeoutMs: _i,
      turnTimeoutMs: _t,
      ...start
    } = input;
    const started: SessionHandle = await adapter.start(start, {
      sink,
      guard: new ScopeGuard({
        cwd: input.cwd,
        projectRoot: input.projectRoot,
        ownedPaths: input.ownedPaths,
        audit: this.deps.audit,
        executionId: input.executionId,
        taskId: input.taskId,
      }),
      approvals,
      onSessionId,
    });
    ref.inner = started;

    let knownId: string | null = null;
    void started.sessionId.then(
      (id) => {
        knownId = id;
        if (ref.wrapped && !this.handles.has(id)) this.handles.set(id, ref.wrapped);
      },
      () => undefined,
    );
    const ended = (sessionId: string | null) => {
      if (!sessionId) return;
      this.liveness.unwatch(sessionId);
      this.handles.delete(sessionId);
      this.lastActivityWrite.delete(sessionId);
      const ts = this.now();
      patch(sessionId, { status: "stopped", endedAt: ts, lastActivityAt: ts });
    };

    const wrapped: SessionHandle = {
      kind: started.kind,
      sessionId: started.sessionId,
      get done() {
        return started.done;
      },
      stop: async () => {
        await started.stop();
        ended(knownId);
      },
      interrupt: () => started.interrupt(),
      sendMessage: async (text) => {
        await started.sendMessage(text);
        if (knownId) {
          patch(knownId, { status: "running", lastActivityAt: this.now() });
          this.liveness.turnStarted(knownId);
        }
      },
      setPermissionMode: (mode) => started.setPermissionMode(mode),
    };
    if (started.onWaitingForInput) {
      const listen = started.onWaitingForInput.bind(started);
      // a start-up dialog waits for a human: no idle/turn timeout while it is open
      listen((waiting) => {
        if (knownId) this.liveness.setWaiting(knownId, waiting);
      });
      wrapped.onWaitingForInput = (listener) => listen(listener);
    }
    ref.wrapped = wrapped;
    return wrapped;
  }

  async readOnlyQuery(input: {
    cwd: string;
    prompt: string;
    model?: string;
    maxTurns?: number;
  }): Promise<{ text: string; usage: Usage | null }> {
    const handle = await this.adapter().start(
      {
        executionId: "",
        taskId: null,
        projectRoot: input.cwd,
        cwd: input.cwd,
        prompt: input.prompt,
        ownedPaths: [],
        permissionMode: "plan",
        allowedTools: READ_ONLY_TOOLS,
        maxTurns: input.maxTurns ?? 8,
        ...(input.model === undefined ? {} : { model: input.model }),
      },
      {
        sink: { emit: () => undefined },
        guard: readOnlyGuard(input.cwd),
        approvals: { request: () => Promise.resolve("deny") },
      },
    );
    try {
      const r = await handle.done;
      if (r.outcome !== "completed") {
        throw new Error(`Read-only query ${r.outcome}: ${r.error ?? "no result"}`);
      }
      return { text: r.resultText ?? "", usage: r.usage };
    } finally {
      await handle.stop().catch(() => undefined);
    }
  }

  getHandle(sessionId: string): SessionHandle | undefined {
    return this.handles.get(sessionId);
  }

  async stopAll(): Promise<void> {
    const all = [...this.handles.values()];
    await Promise.allSettled(all.map((h) => h.stop()));
  }

  /** Stop liveness timers (server shutdown, after stopAll). */
  close(): void {
    this.liveness.close();
  }

  /** Session row projection of a managed runtime event. */
  private project(e: EventInput, patch: (id: string, p: Partial<Session>) => void): void {
    const id = e.sessionId;
    if (!id) return;
    const ts = e.ts ?? this.now();
    switch (e.type) {
      case "agent.waiting":
      case "error": {
        const outcome = (e.payload as { outcome?: unknown } | null | undefined)?.outcome;
        if (outcome === undefined) break; // not an end-of-turn event
        const usage = usageFrom(e.payload);
        this.liveness.turnEnded(id);
        patch(id, {
          status: e.type === "error" ? "failed" : "idle",
          lastActivityAt: ts,
          ...(usage ? { usage } : {}),
        });
        this.lastActivityWrite.set(id, ts);
        return;
      }
      case "session.stopped":
        this.liveness.unwatch(id);
        patch(id, { status: "stopped", endedAt: ts, lastActivityAt: ts });
        return;
      default:
        break;
    }
    const last = this.lastActivityWrite.get(id) ?? 0;
    if (ts - last >= ACTIVITY_WRITE_MS) {
      this.lastActivityWrite.set(id, ts);
      patch(id, { lastActivityAt: ts });
    }
  }

  private lookupBranch(
    sessionId: string,
    cwd: string,
    root: string,
    patch: (id: string, p: Partial<Session>) => void,
  ): void {
    const resolver = this.deps.gitBranch;
    if (!resolver) return;
    resolver(cwd, root)
      .then((gitBranch) => {
        if (gitBranch) patch(sessionId, { gitBranch });
      })
      .catch((err: unknown) =>
        this.deps.logger.debug({ err, sessionId }, "git branch lookup failed"),
      );
  }
}
