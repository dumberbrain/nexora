import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ExecutionConfigSchema, type RuntimeKind, type SessionStatus } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { executions } from "../../../src/db/schema";
import { createLogger } from "../../../src/lib/logger";
import { EventBus, EventStore } from "../../../src/modules/event-manager";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";
import { ProjectRepository } from "../../../src/modules/project-registry";
import {
  AGENT_SDK_CAPABILITIES,
  CLI_HEADLESS_CAPABILITIES,
} from "../../../src/modules/runtime-manager/capabilities";
import { type ClaudeProbe } from "../../../src/modules/runtime-manager/environment";
import {
  CapabilityUnsupportedError,
  type RuntimeAdapter,
  type RuntimeDeps,
  type SessionHandle,
  type SessionResult,
  type StartSessionInput,
} from "../../../src/modules/runtime-manager/runtime-adapter";
import { RuntimeManager } from "../../../src/modules/runtime-manager/runtime-manager";
import { SessionRepository } from "../../../src/modules/session-manager";

const SID = "06109064-d9fe-49a8-9df1-ddcb12bca712";
const EXEC = "01JD8X3Y4Z5A6B7C8D9E0F1G2H";

type ScriptedHandle = Omit<
  SessionHandle,
  "stop" | "interrupt" | "sendMessage" | "setPermissionMode"
> & {
  stop: Mock<SessionHandle["stop"]>;
  interrupt: Mock<SessionHandle["interrupt"]>;
  sendMessage: Mock<SessionHandle["sendMessage"]>;
  setPermissionMode: Mock<SessionHandle["setPermissionMode"]>;
  finish(r: Partial<SessionResult>): void;
};

/** Scriptable adapter: the test drives events through the captured deps. */
class ScriptedAdapter implements RuntimeAdapter {
  started: { input: StartSessionInput; deps: RuntimeDeps }[] = [];
  handles: ScriptedHandle[] = [];
  constructor(
    readonly kind: RuntimeKind = "agent_sdk",
    private readonly available = true,
  ) {}

  detect() {
    return Promise.resolve({
      available: this.available,
      version: null,
      reason: this.available ? null : "missing",
    });
  }

  capabilities() {
    return this.kind === "agent_sdk" ? AGENT_SDK_CAPABILITIES : CLI_HEADLESS_CAPABILITIES;
  }

  start(input: StartSessionInput, deps: RuntimeDeps): Promise<SessionHandle> {
    this.started.push({ input, deps });
    let resolveDone!: (r: SessionResult) => void;
    let done = new Promise<SessionResult>((r) => (resolveDone = r));
    const handle: ScriptedHandle = {
      kind: this.kind,
      sessionId: Promise.resolve(SID),
      get done() {
        return done;
      },
      stop: vi.fn(() => Promise.resolve()),
      interrupt: vi.fn(() => Promise.resolve()),
      sendMessage: vi.fn(() => {
        done = new Promise<SessionResult>((r) => (resolveDone = r));
        return Promise.resolve();
      }),
      setPermissionMode: vi.fn(() => Promise.resolve()),
      finish(r: Partial<SessionResult>) {
        resolveDone({
          outcome: "completed",
          sessionId: SID,
          resultText: null,
          usage: null,
          error: null,
          ...r,
        });
      },
    };
    this.handles.push(handle);
    return Promise.resolve(handle);
  }
}

let db: Db;
let bus: EventBus;
let store: EventStore;
let sessions: SessionRepository;
let projects: ProjectRepository;
let audit: AuditService;
let tmp: string;
let repo: string;
let worktree: string;
let sdk: ScriptedAdapter;
let manager: RuntimeManager;

const claude: ClaudeProbe = {
  version: () => Promise.resolve("2.1.3 (Claude Code)"),
  authStatus: () => Promise.resolve({ exitCode: 0, stdout: '{"loggedIn":true}', stderr: "" }),
};

beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  bus = new EventBus();
  store = new EventStore(db, bus, { batchMs: 0 });
  sessions = new SessionRepository(db);
  projects = new ProjectRepository(db);
  audit = new AuditService(db);
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "nexora-rm-")));
  repo = join(tmp, "repo");
  worktree = join(repo, ".nexora", "worktrees", EXEC, "main");
  mkdirSync(worktree, { recursive: true });
  projects.insert({
    id: "01JD8X3Y4Z5A6B7C8D9E0F1G2P",
    name: "repo",
    rootPath: repo,
    detectedStack: { languages: [], frameworks: [], testRunners: [] },
    instructionFiles: [],
    createdAt: Date.now(),
  });
  db.insert(executions)
    .values({
      id: EXEC,
      projectId: "01JD8X3Y4Z5A6B7C8D9E0F1G2P",
      prompt: "build it",
      config: ExecutionConfigSchema.parse({}),
      status: "running",
      createdAt: Date.now(),
    })
    .run();
  sdk = new ScriptedAdapter();
  manager = new RuntimeManager({
    adapters: [sdk, new ScriptedAdapter("cli_headless", false)],
    sessions,
    projects,
    store,
    bus,
    audit,
    logger: createLogger({ level: "silent" }),
    claude,
    env: {},
    homeDir: tmp,
    projectRoots: () => [repo],
  });
});

afterEach(async () => {
  await manager.stopAll();
  manager.close();
  store.close();
  closeDb(db);
  rmSync(tmp, { recursive: true, force: true });
});

const startInput = (
  over: Partial<StartSessionInput & { idleTimeoutMs: number; turnTimeoutMs: number }> = {},
) => ({
  executionId: EXEC,
  taskId: "T-1",
  projectRoot: repo,
  cwd: worktree,
  prompt: "build it",
  ownedPaths: ["src/**"],
  permissionMode: "default" as const,
  executionMode: "multi_session" as const,
  idleTimeoutMs: 600_000,
  turnTimeoutMs: 1_800_000,
  ...over,
});

const status = (): SessionStatus | undefined => sessions.get(SID)?.status;

async function started() {
  const approvals = { request: vi.fn(() => Promise.resolve<"allow" | "deny">("allow")) };
  const handle = await manager.startManagedSession(startInput(), { approvals });
  const run = sdk.started.at(-1);
  if (!run) throw new Error("adapter not started");
  run.deps.onSessionId?.(SID, { model: "claude-haiku-5-5", cwd: worktree });
  return { handle, run, approvals };
}

describe("RuntimeManager.environment", () => {
  it("reports claude, agent teams and every registered runtime", async () => {
    const env = await manager.environment();
    expect(env.claude).toEqual({
      installed: true,
      version: "2.1.3 (Claude Code)",
      authenticated: true,
      reason: null,
    });
    expect(env.agentTeams.enabled).toBe(false);
    expect(env.runtimes).toEqual([
      { kind: "agent_sdk", available: true, reason: null, capabilities: AGENT_SDK_CAPABILITIES },
      {
        kind: "cli_headless",
        available: false,
        reason: "missing",
        capabilities: CLI_HEADLESS_CAPABILITIES,
      },
    ]);
  });

  it("caches detection for a short time", async () => {
    const spy = vi.spyOn(sdk, "detect");
    await manager.environment();
    await manager.environment();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("RuntimeManager.startManagedSession", () => {
  it("starts the default runtime in the worktree and records a managed session row", async () => {
    const { run } = await started();
    expect(run.input).toMatchObject({ cwd: worktree, executionId: EXEC, taskId: "T-1" });
    const s = sessions.get(SID);
    expect(s).toMatchObject({
      runtime: "agent_sdk",
      executionId: EXEC,
      executionMode: "multi_session",
      currentTaskId: "T-1",
      observeOnly: false,
      worktreePath: worktree,
      cwd: worktree,
      model: "claude-haiku-5-5",
      status: "running",
      projectId: "01JD8X3Y4Z5A6B7C8D9E0F1G2P",
      capabilities: AGENT_SDK_CAPABILITIES,
    });
    expect(manager.getHandle(SID)).toBeDefined();
  });

  it("refuses a cwd that is the project root itself (never write to the root — FR-034)", async () => {
    await expect(
      manager.startManagedSession(startInput({ cwd: repo }), {
        approvals: { request: () => Promise.resolve("deny") },
      }),
    ).rejects.toThrow(/worktree/);
    expect(sdk.started).toHaveLength(0);
  });

  it("an unregistered runtime is CAPABILITY_UNSUPPORTED", async () => {
    await expect(
      manager.startManagedSession(
        { ...startInput(), runtime: "agent_team_pty" },
        { approvals: { request: () => Promise.resolve("deny") } },
      ),
    ).rejects.toBeInstanceOf(CapabilityUnsupportedError);
  });

  it("gives the adapter a scope guard bound to the task (writes outside owned paths denied)", async () => {
    const { run } = await started();
    const check = (file: string) =>
      run.deps.guard.check({
        sessionId: SID,
        agentId: null,
        toolName: "Write",
        input: { file_path: join(worktree, file) },
      }).decision;
    expect(check("src/a.ts")).toBe("allow");
    expect(check("package.json")).toBe("deny");
    expect(
      run.deps.guard.check({ sessionId: SID, agentId: null, toolName: "Bash", input: {} }),
    ).toMatchObject({ decision: "ask" });
  });

  it("persists runtime events and projects status + usage onto the session", async () => {
    const { run } = await started();
    run.deps.sink.emit({
      type: "tool.invoked",
      source: "agent_sdk",
      reliability: "authoritative",
      severity: "info",
      executionId: EXEC,
      taskId: "T-1",
      sessionId: SID,
      agentId: null,
      summary: "Read a.ts",
    });
    const usage = { inputTokens: 10, outputTokens: 5, costUsd: 0.01, costIsEstimate: true };
    run.deps.sink.emit({
      type: "agent.waiting",
      source: "agent_sdk",
      reliability: "authoritative",
      severity: "info",
      executionId: EXEC,
      taskId: "T-1",
      sessionId: SID,
      agentId: null,
      summary: "Turn completed",
      payload: { outcome: "completed", usage },
    });
    store.flush();
    const types = store.list({ limit: 10, sessionId: SID }).items.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["tool.invoked", "agent.waiting"]));
    expect(sessions.get(SID)).toMatchObject({ status: "idle", usage });
  });

  it("marks the session waiting_for_approval while the ApprovalGate is pending", async () => {
    let decide!: (d: "allow" | "deny") => void;
    const approvals = {
      request: vi.fn(() => new Promise<"allow" | "deny">((r) => (decide = r))),
    };
    await manager.startManagedSession(startInput(), { approvals });
    const run = sdk.started.at(-1);
    if (!run) throw new Error("not started");
    run.deps.onSessionId?.(SID, { model: null, cwd: worktree });
    const pending = run.deps.approvals.request({
      executionId: EXEC,
      taskId: "T-1",
      sessionId: SID,
      agentId: null,
      toolName: "Bash",
      input: { command: "npm test" },
      riskClass: "normal",
      reason: "Shell command",
    });
    expect(status()).toBe("waiting_for_approval");
    decide("allow");
    await expect(pending).resolves.toBe("allow");
    expect(status()).toBe("running");
  });

  it("sendMessage on the returned handle starts a new turn (status running)", async () => {
    const { handle, run } = await started();
    run.deps.sink.emit({
      type: "agent.waiting",
      source: "agent_sdk",
      reliability: "authoritative",
      severity: "info",
      sessionId: SID,
      summary: "Turn completed",
      payload: { outcome: "completed", usage: null },
    });
    expect(status()).toBe("idle");
    await handle.sendMessage("next");
    expect(sdk.handles.at(-1)?.sendMessage).toHaveBeenCalledWith("next");
    expect(status()).toBe("running");
  });

  it("a turn exceeding turnTimeoutMs is interrupted and reported", async () => {
    vi.useFakeTimers();
    try {
      const onTurnTimeout = vi.fn();
      await manager.startManagedSession(startInput({ turnTimeoutMs: 1000, idleTimeoutMs: 5000 }), {
        approvals: { request: () => Promise.resolve("deny") },
        onTurnTimeout,
      });
      sdk.started.at(-1)?.deps.onSessionId?.(SID, { model: null, cwd: worktree });
      await vi.advanceTimersByTimeAsync(1001);
      expect(sdk.handles.at(-1)?.interrupt).toHaveBeenCalled();
      expect(onTurnTimeout).toHaveBeenCalledWith({ sessionId: SID, taskId: "T-1" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a start-up dialog of an interactive lead suspends the timeouts and is forwarded", async () => {
    vi.useFakeTimers();
    try {
      const listeners = new Set<(w: boolean) => void>();
      const original = sdk.start.bind(sdk);
      vi.spyOn(sdk, "start").mockImplementation(async (input, deps) => {
        const h = await original(input, deps);
        h.onWaitingForInput = (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        };
        return h;
      });
      const handle = await manager.startManagedSession(
        startInput({ turnTimeoutMs: 1000, idleTimeoutMs: 5000 }),
        { approvals: { request: () => Promise.resolve("deny") } },
      );
      sdk.started.at(-1)?.deps.onSessionId?.(SID, { model: null, cwd: worktree });
      await vi.advanceTimersByTimeAsync(0);
      const forwarded: boolean[] = [];
      handle.onWaitingForInput?.((w) => forwarded.push(w));
      for (const l of [...listeners]) l(true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(sdk.handles.at(-1)?.interrupt).not.toHaveBeenCalled();
      for (const l of [...listeners]) l(false);
      await vi.advanceTimersByTimeAsync(1001);
      expect(sdk.handles.at(-1)?.interrupt).toHaveBeenCalled();
      expect(forwarded).toEqual([true, false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidateEnvironment drops the cached detection", async () => {
    const spy = vi.spyOn(sdk, "detect");
    await manager.environment();
    manager.invalidateEnvironment();
    await manager.environment();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("stopAll stops every managed session and marks it stopped", async () => {
    const { handle } = await started();
    await manager.stopAll();
    expect(sdk.handles.at(-1)?.stop).toHaveBeenCalled();
    expect(sessions.get(SID)).toMatchObject({ status: "stopped" });
    expect(sessions.get(SID)?.endedAt).not.toBeNull();
    expect(manager.getHandle(SID)).toBeUndefined();
    void handle;
  });
});

describe("RuntimeManager.readOnlyQuery", () => {
  it("runs a plan-mode, read-only single turn and returns its text and usage", async () => {
    const usage = { inputTokens: 1, outputTokens: 2, costUsd: null, costIsEstimate: true };
    const pending = manager.readOnlyQuery({ cwd: repo, prompt: "analyse" });
    await vi.waitFor(() => expect(sdk.handles).toHaveLength(1));
    const run = sdk.started[0];
    if (!run) throw new Error("not started");
    expect(run.input).toMatchObject({
      cwd: repo,
      permissionMode: "plan",
      allowedTools: ["Read", "Glob", "Grep"],
      maxTurns: 8,
    });
    const g = (toolName: string, input: Record<string, unknown>) =>
      run.deps.guard.check({ sessionId: "x", agentId: null, toolName, input }).decision;
    expect(g("Read", { file_path: join(repo, "a.ts") })).toBe("allow");
    expect(g("Write", { file_path: join(repo, "a.ts") })).toBe("deny");
    expect(g("Bash", { command: "ls" })).toBe("deny");
    await expect(
      run.deps.approvals.request({
        executionId: "",
        taskId: null,
        sessionId: "x",
        agentId: null,
        toolName: "Bash",
        input: {},
        riskClass: "normal",
        reason: "",
      }),
    ).resolves.toBe("deny");

    sdk.handles[0]?.finish({ resultText: '{"ok":true}', usage });
    await expect(pending).resolves.toEqual({ text: '{"ok":true}', usage });
    expect(sdk.handles[0]?.stop).toHaveBeenCalled();
  });

  it("rejects when the turn fails", async () => {
    const pending = manager.readOnlyQuery({ cwd: repo, prompt: "analyse" });
    await vi.waitFor(() => expect(sdk.handles).toHaveLength(1));
    sdk.handles[0]?.finish({ outcome: "failed", error: "budget" });
    await expect(pending).rejects.toThrow(/budget/);
  });
});
