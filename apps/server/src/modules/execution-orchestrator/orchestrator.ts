import {
  type ApprovalRequest,
  type ApproveExecutionInput,
  type CreateExecutionInput,
  type Execution,
  type ExecutionConfig,
  ExecutionConfigSchema,
  type ExecutionStatus,
  type ExecutionTasks,
  type GeneratePlanInput,
  type ModeOption,
  type PlanConflict,
  type Question,
  type SetModeInput,
  type Task,
  type Verification,
} from "@nexora/contracts";

import { BUILT_IN_ROLE_NAMES } from "./agents/roles";
import { type AnalysisService } from "./analysis/analysis.service";
import { type ConsentService } from "./consent.service";
import { assertExecutionTransition, isTerminalExecution } from "./execution-state";
import { type ExecutionPatch, type ExecutionRepository } from "./execution.repository";
import { adviseModes } from "./mode-advisor";
import { filesOwnedBy, taskPrompt } from "./modes/multi-session";
import { subagentDefinitions, subagentsGate, subagentsPrompt, unionScope } from "./modes/subagents";
import { detectConflicts } from "./planner/conflict-detector";
import { heuristicPlan, parsePlanOutput, planPrompt } from "./planner/planner";
import { buildQuestions } from "./questions";
import { nextStarts, unreachableTasks } from "./scheduler";
import { buildVerification } from "./verifier";
import { type WorktreeProvider } from "./worktree-provider";
import { AppError } from "../../http/errors";
import { type Logger } from "../../lib/logger";
import { newId } from "../../lib/ulid";
import { type CommunicationService } from "../communication-manager/communication.service";
import { type DomainEmitter } from "../event-manager/domain-emitter";
import { type ApprovalService, TASK_START_ACTION } from "../permission-manager/approval.service";
import { type AuditService } from "../permission-manager/audit.service";
import { type ProjectService } from "../project-registry";
import {
  type ManagedRuntime,
  type SessionHandle,
  type SessionResult,
  type StartSessionInput,
} from "../runtime-manager/runtime-adapter";
import { discoverSkills } from "../skill-registry/discovery";
import { isTerminalTask } from "../task-manager/task-state";
import { type TaskService } from "../task-manager/task.service";

export interface OrchestratorDeps {
  executions: ExecutionRepository;
  tasks: TaskService;
  approvals: ApprovalService;
  consent: ConsentService;
  analysis: AnalysisService;
  communication: CommunicationService;
  runtime: ManagedRuntime;
  worktrees: WorktreeProvider;
  projects: ProjectService;
  audit: AuditService;
  emitter: DomainEmitter;
  logger: Logger;
  homeDir: string;
  now?: () => number;
}

export interface ConsentInput {
  consent: boolean;
  rememberConsentForProject: boolean;
}

/** One running managed session and the tasks it works on. */
interface LiveSession {
  handle: SessionHandle;
  taskIds: string[];
  cwd: string;
  sessionId: string | null;
}

interface LiveExecution {
  /** key: task id (multi-session) or "*" (subagents) */
  sessions: Map<string, LiveSession>;
  worktreePaths: Set<string>;
  stopping: boolean;
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const MODE_EDITABLE: ReadonlySet<ExecutionStatus> = new Set([
  "awaiting_mode",
  "configuring",
  "plan_ready",
]);
const SUBAGENTS_KEY = "*";

/**
 * Execution orchestrator (T097): the execution state machine, consent-gated analysis/planning,
 * approval of the plan, and the scheduler loop that starts managed sessions (only through
 * ManagedRuntime, always inside a Nexora worktree) and reacts to their outcome.
 *
 * All mutations of one execution run on a per-execution serial chain, so HTTP requests, approval
 * decisions and session completions never interleave.
 */
export class Orchestrator {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly live = new Map<string, LiveExecution>();
  private readonly now: () => number;
  private closed = false;
  private readonly offDecided: () => void;

  constructor(private readonly deps: OrchestratorDeps) {
    this.now = deps.now ?? Date.now;
    this.offDecided = deps.approvals.onDecided((a) => this.onApprovalDecided(a));
  }

  // ---------------------------------------------------------------- queries

  list(q: { projectId?: string } = {}): Execution[] {
    return this.deps.executions.list(q);
  }

  get(id: string): Execution {
    const e = ULID.test(id) ? this.deps.executions.get(id) : undefined;
    if (!e) throw new AppError("NOT_FOUND", "Execution not found");
    return e;
  }

  async modes(id: string): Promise<ModeOption[]> {
    const e = this.get(id);
    if (!e.analysis)
      throw new AppError("CONFLICT", `Execution is ${e.status}; analysis is not ready`);
    return adviseModes({
      analysis: e.analysis,
      prompt: e.prompt,
      env: await this.deps.runtime.environment(),
    });
  }

  questions(id: string): Question[] {
    const e = this.get(id);
    if (!e.mode) throw new AppError("CONFLICT", "Choose an execution mode first");
    return buildQuestions({
      mode: e.mode,
      strategy: e.strategy,
      analysis: e.analysis,
      prompt: e.prompt,
      config: e.config,
    });
  }

  tasks(id: string): ExecutionTasks {
    const e = this.get(id);
    const items = this.deps.tasks.list(id);
    return { items, conflicts: this.conflictsOf(e, items) };
  }

  async verification(id: string): Promise<Verification> {
    const e = this.get(id);
    return e.verification ?? (await this.verify(e));
  }

  // ---------------------------------------------------------------- wizard

  async create(input: CreateExecutionInput, actor: string): Promise<Execution> {
    const project = this.deps.projects.getRow(input.projectId);
    const now = this.now();
    const id = newId(now);
    const e = this.deps.executions.insert({
      id,
      projectId: project.id,
      prompt: input.prompt,
      analysis: null,
      mode: null,
      strategy: null,
      config: ExecutionConfigSchema.parse({}),
      status: "draft",
      permissionBypass: false,
      worktreePath: null,
      verification: null,
      createdAt: now,
      startedAt: null,
      endedAt: null,
    });
    this.deps.audit.record({
      actor,
      action: "execution.create",
      targetType: "execution",
      targetId: id,
      outcome: "success",
      details: { projectId: project.id, promptChars: input.prompt.length },
    });
    return this.serial(id, async () => {
      this.setStatus(e, "analyzing");
      try {
        const analysis = await this.deps.analysis.analyzeLocally(project.rootPath, input.prompt);
        return this.setStatus(this.get(id), "awaiting_mode", { analysis });
      } catch (err) {
        this.deps.logger.error({ err, executionId: id }, "local analysis failed");
        return this.setStatus(this.get(id), "failed", { endedAt: this.now() });
      }
    });
  }

  /** Model-backed analysis refinement — requires consent (FR-008). */
  refineAnalysis(id: string, input: ConsentInput, actor: string): Promise<Execution> {
    return this.serial(id, async () => {
      const e = this.get(id);
      if (!MODE_EDITABLE.has(e.status) || !e.analysis) {
        throw new AppError("CONFLICT", `Execution is ${e.status}; analysis cannot be refined`);
      }
      const config = this.requireConsent(e, input, actor, "execution.refine_analysis");
      const root = this.deps.projects.getRow(e.projectId).rootPath;
      const refined = await this.deps.analysis.refineWithModel(root, e.prompt, e.analysis);
      if (!refined) {
        this.deps.emitter.event({
          type: "error",
          executionId: id,
          severity: "warn",
          summary: "Model analysis returned invalid output; the local analysis was kept",
        });
      }
      this.deps.audit.record({
        actor,
        action: "execution.refine_analysis",
        targetType: "execution",
        targetId: id,
        outcome: refined ? "success" : "failed",
      });
      return this.update(e, { config, ...(refined ? { analysis: refined } : {}) });
    });
  }

  setMode(id: string, input: SetModeInput, actor: string): Promise<Execution> {
    return this.serial(id, async () => {
      const e = this.get(id);
      if (!MODE_EDITABLE.has(e.status)) {
        throw new AppError("CONFLICT", `Execution is ${e.status}; the mode can no longer change`);
      }
      const option = (await this.modes(id)).find((m) => m.mode === input.mode);
      if (!option?.available) {
        this.deps.audit.record({
          actor,
          action: "execution.set_mode",
          targetType: "execution",
          targetId: id,
          outcome: "denied",
          details: { mode: input.mode, reason: option?.unavailableReason },
        });
        throw new AppError(
          "CAPABILITY_UNSUPPORTED",
          option?.unavailableReason ?? `${input.mode} is not available`,
        );
      }
      this.deps.audit.record({
        actor,
        action: "execution.set_mode",
        targetType: "execution",
        targetId: id,
        outcome: "success",
        details: input,
      });
      return this.backToConfiguring(e, { mode: input.mode, strategy: input.strategy });
    });
  }

  updateConfig(id: string, patch: Partial<ExecutionConfig>, actor: string): Promise<Execution> {
    return this.serial(id, () => {
      const e = this.get(id);
      if (e.status !== "configuring" && e.status !== "plan_ready") {
        throw new AppError("CONFLICT", `Execution is ${e.status}; configuration is locked`);
      }
      const config = ExecutionConfigSchema.parse({ ...e.config, ...patch });
      this.deps.audit.record({
        actor,
        action: "execution.update_config",
        targetType: "execution",
        targetId: id,
        outcome: "success",
        details: { keys: Object.keys(patch) },
      });
      return Promise.resolve(this.backToConfiguring(e, { config }));
    });
  }

  generatePlan(id: string, input: GeneratePlanInput, actor: string): Promise<ExecutionTasks> {
    return this.serial(id, async () => {
      const e = this.get(id);
      if ((e.status !== "configuring" && e.status !== "plan_ready") || !e.mode) {
        throw new AppError("CONFLICT", `Execution is ${e.status}; a plan cannot be generated`);
      }
      const sequential = e.config.parallelism === "sequential";
      let config = e.config;
      let planned;
      if (input.modelAssisted) {
        config = this.requireConsent(e, input, actor, "execution.plan");
        const root = this.deps.projects.getRow(e.projectId).rootPath;
        const { text } = await this.deps.runtime.readOnlyQuery({
          cwd: root,
          prompt: planPrompt({
            prompt: e.prompt,
            mode: e.mode,
            roles: [...BUILT_IN_ROLE_NAMES, ...(e.analysis?.agents ?? [])],
            sequential,
          }),
        });
        planned = parsePlanOutput(text);
      } else {
        planned = heuristicPlan({ prompt: e.prompt, sequential });
      }
      const items = this.deps.tasks.createPlan(id, e.mode, planned);
      const next =
        e.status === "plan_ready"
          ? this.update(e, { config })
          : this.setStatus(e, "plan_ready", { config });
      this.deps.audit.record({
        actor,
        action: "execution.plan",
        targetType: "execution",
        targetId: id,
        outcome: "success",
        details: { modelAssisted: input.modelAssisted, tasks: items.length },
      });
      return { items, conflicts: this.conflictsOf(next, items) };
    });
  }

  approve(id: string, input: ApproveExecutionInput, actor: string): Promise<Execution> {
    const result = this.serial(id, async () => {
      const e = this.get(id);
      if (e.status !== "plan_ready") {
        throw new AppError(
          "CONFLICT",
          `Execution is ${e.status}; only a ready plan can be approved`,
        );
      }
      const tasks = this.deps.tasks.list(id);
      const risky = new Set(tasks.filter((t) => t.riskClass !== "normal").map((t) => t.id));
      const notRisky = input.approveRiskyTaskIds.filter((t) => !risky.has(t));
      if (notRisky.length > 0) {
        throw new AppError("VALIDATION_FAILED", "approveRiskyTaskIds may only list risky tasks", [
          { path: "approveRiskyTaskIds", message: `not risky or unknown: ${notRisky.join(", ")}` },
        ]);
      }
      const root = this.deps.projects.getRow(e.projectId).rootPath;
      // the worktree exists before anything runs; on failure the plan simply stays ready
      const worktreePath = await this.deps.worktrees.executionWorktree(root, id);
      const live = this.liveOf(id);
      live.worktreePaths.add(worktreePath);

      this.setStatus(e, "awaiting_approval");
      const running = this.setStatus(this.get(id), "running", {
        worktreePath,
        permissionBypass: input.permissionBypass,
        startedAt: this.now(),
      });
      this.deps.audit.record({
        actor,
        action: "execution.approve",
        targetType: "execution",
        targetId: id,
        outcome: "success",
        details: {
          permissionBypass: input.permissionBypass,
          approveRiskyTaskIds: input.approveRiskyTaskIds,
        },
      });
      for (const t of tasks) {
        if (t.riskClass === "normal") {
          this.deps.tasks.transition(id, t.id, "queued");
          continue;
        }
        const a = this.deps.approvals.createTaskApproval({
          executionId: id,
          taskId: t.id,
          riskClass: t.riskClass,
          title: t.title,
        });
        if (input.approveRiskyTaskIds.includes(t.id)) {
          this.deps.approvals.decide(
            a.id,
            { decision: "approve", note: "approved with the plan" },
            actor,
          );
        }
      }
      return running;
    });
    void result.then(
      () => this.kick(id),
      () => undefined,
    );
    return result;
  }

  stop(id: string, actor: string): Promise<Execution> {
    return this.serial(id, async () => {
      const e = this.get(id);
      if (isTerminalExecution(e.status)) {
        throw new AppError("CONFLICT", `Execution is already ${e.status}`);
      }
      const live = this.liveOf(id);
      live.stopping = true;
      await Promise.all(
        [...live.sessions.values()].map((s) =>
          s.handle.stop().catch((err: unknown) => {
            this.deps.logger.warn({ err, executionId: id }, "stopping a session failed");
          }),
        ),
      );
      live.sessions.clear();
      for (const t of this.deps.tasks.list(id)) {
        if (!isTerminalTask(t.status)) this.deps.tasks.transition(id, t.id, "cancelled");
      }
      this.deps.approvals.expireForExecution(id);
      this.deps.audit.record({
        actor,
        action: "execution.stop",
        targetType: "execution",
        targetId: id,
        outcome: "success",
      });
      return this.setStatus(this.get(id), "cancelled", { endedAt: this.now() });
    });
  }

  /** Stop scheduling and wait for in-flight work (server shutdown / tests). */
  async close(): Promise<void> {
    this.closed = true;
    this.offDecided();
    await Promise.allSettled([...this.chains.values()]);
  }

  // ---------------------------------------------------------------- scheduling

  private kick(id: string): void {
    this.background(id, "scheduling", () => this.tick(id));
  }

  /** Fire-and-forget work on the execution's chain; failures are logged, never thrown. */
  private background(id: string, what: string, fn: () => Promise<void>): void {
    if (this.closed) return;
    this.serial(id, fn).catch((err: unknown) => {
      if (!this.closed) this.deps.logger.error({ err, executionId: id }, `${what} failed`);
    });
  }

  private onApprovalDecided(a: ApprovalRequest): void {
    if (a.action !== TASK_START_ACTION || !a.executionId || !a.taskId) return;
    const { executionId, taskId } = a;
    this.background(executionId, "applying an approval decision", async () => {
      const e = this.deps.executions.get(executionId);
      if (e?.status !== "running") return;
      const t = this.deps.tasks.get(executionId, taskId);
      if (t.status !== "pending") return;
      if (a.status === "approved") this.deps.tasks.transition(executionId, taskId, "queued");
      else if (a.status === "rejected")
        this.deps.tasks.transition(executionId, taskId, "cancelled");
      await this.tick(executionId);
    });
  }

  /** One scheduling round; always runs on the execution's serial chain. */
  private async tick(id: string): Promise<void> {
    const e = this.deps.executions.get(id);
    if (e?.status !== "running" || this.liveOf(id).stopping) return;
    for (const tid of unreachableTasks(this.deps.tasks.list(id))) {
      this.deps.tasks.transition(id, tid, "cancelled");
    }
    if (e.mode === "subagents") await this.tickSubagents(e);
    else await this.tickMultiSession(e);
    await this.maybeFinish(id);
  }

  private async tickMultiSession(e: Execution): Promise<void> {
    const tasks = this.deps.tasks.list(e.id);
    const starts = nextStarts({
      tasks,
      conflicts: this.conflictsOf(e, tasks),
      approvedRiskyTaskIds: this.deps.approvals.approvedTaskIds(e.id),
      maxParallelSessions: e.config.maxParallelSessions,
      sequential: e.config.parallelism === "sequential",
    });
    const root = this.deps.projects.getRow(e.projectId).rootPath;
    for (const s of starts) {
      const task = tasks.find((t) => t.id === s.taskId) as Task;
      this.assign(e.id, task);
      try {
        const cwd =
          s.workspace === "task"
            ? await this.deps.worktrees.taskWorktree(root, e.id, task.id)
            : this.worktreeOf(e);
        this.liveOf(e.id).worktreePaths.add(cwd);
        await this.startSession(e, [task.id], task.id, {
          cwd,
          projectRoot: root,
          prompt: taskPrompt(e, task, tasks),
          ownedPaths: task.ownedPaths.includes("**") ? [] : task.ownedPaths,
        });
      } catch (err) {
        this.failStart(e.id, [task.id], err);
      }
    }
  }

  private async tickSubagents(e: Execution): Promise<void> {
    if (this.liveOf(e.id).sessions.has(SUBAGENTS_KEY)) return;
    const tasks = this.deps.tasks.list(e.id);
    if (subagentsGate(tasks) !== "start") return;
    const queued = tasks.filter((t) => t.status === "queued");
    const root = this.deps.projects.getRow(e.projectId).rootPath;
    for (const t of queued) this.assign(e.id, t);
    const ids = queued.map((t) => t.id);
    try {
      const discovered = await discoverSkills({ projectRoot: root, homeDir: this.deps.homeDir });
      const agents = subagentDefinitions(discovered);
      await this.startSession(e, ids, SUBAGENTS_KEY, {
        cwd: this.worktreeOf(e),
        projectRoot: root,
        prompt: subagentsPrompt(e, queued, Object.keys(agents)),
        ownedPaths: unionScope(queued),
        agents,
        ...(e.config.budgetUsd === undefined ? {} : { maxBudgetUsd: e.config.budgetUsd }),
      });
    } catch (err) {
      this.failStart(e.id, ids, err);
    }
  }

  private assign(executionId: string, task: Task): void {
    this.deps.tasks.transition(executionId, task.id, "planning", {
      event: {
        type: "task.assigned",
        summary: `${task.id} assigned${task.assignedAgentRole ? ` to ${task.assignedAgentRole}` : ""}`,
        payload: { role: task.assignedAgentRole },
      },
    });
  }

  private async startSession(
    e: Execution,
    taskIds: string[],
    key: string,
    input: Pick<
      StartSessionInput,
      "cwd" | "projectRoot" | "prompt" | "ownedPaths" | "agents" | "maxBudgetUsd"
    >,
  ): Promise<void> {
    const taskId = key === SUBAGENTS_KEY ? null : key;
    const handle = await this.deps.runtime.startManagedSession(
      {
        ...input,
        executionId: e.id,
        taskId,
        executionMode: e.mode ?? "multi_session",
        permissionMode: e.permissionBypass
          ? "bypassPermissions"
          : e.config.approvalCheckpoints
            ? "default"
            : "acceptEdits",
        idleTimeoutMs: e.config.idleTimeoutMs,
        turnTimeoutMs: e.config.turnTimeoutMs,
      },
      {
        approvals: this.deps.approvals,
        onTurnTimeout: () => this.onTurnTimeout(e.id, key),
      },
    );
    const live: LiveSession = { handle, taskIds, cwd: input.cwd, sessionId: null };
    this.liveOf(e.id).sessions.set(key, live);
    void handle.sessionId.then(
      (sid) => (live.sessionId = sid),
      () => undefined,
    );
    for (const id of taskIds) {
      this.deps.tasks.transition(e.id, id, "running", {
        event: { type: "task.started", summary: `${id} started in ${e.mode ?? ""} mode` },
      });
    }
    handle.done.then(
      (r) => this.onSessionDone(e.id, key, live, r),
      (err: unknown) =>
        this.onSessionDone(e.id, key, live, {
          outcome: "failed",
          sessionId: live.sessionId,
          resultText: null,
          usage: null,
          error: err instanceof Error ? err.message : String(err),
        }),
    );
  }

  private failStart(executionId: string, taskIds: string[], err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.deps.logger.warn({ err, executionId, taskIds }, "managed session failed to start");
    for (const id of taskIds) {
      // planning → running → failed: the state machine has no planning → failed edge
      this.deps.tasks.transition(executionId, id, "running");
      this.fail(executionId, id, "start_failed", message);
    }
  }

  private fail(executionId: string, taskId: string, reason: string, error: string | null): void {
    this.deps.tasks.transition(executionId, taskId, "failed", {
      event: {
        type: "task.failed",
        severity: "error",
        summary: `${taskId} failed (${reason})${error ? `: ${error}` : ""}`,
        payload: { reason, error },
      },
    });
  }

  private onTurnTimeout(executionId: string, key: string): void {
    this.background(executionId, "turn timeout handling", async () => {
      const live = this.liveOf(executionId).sessions.get(key);
      if (!live) return;
      for (const id of live.taskIds) {
        const t = this.deps.tasks.get(executionId, id);
        if (isTerminalTask(t.status)) continue;
        if (t.status !== "running") this.toRunning(executionId, t);
        this.fail(executionId, id, "timeout", "turn timeout exceeded");
      }
      await this.maybeFinish(executionId);
    });
  }

  private onSessionDone(
    executionId: string,
    key: string,
    live: LiveSession,
    r: SessionResult,
  ): void {
    this.background(executionId, "handling a finished session", async () => {
      const state = this.liveOf(executionId);
      if (state.sessions.get(key) === live) state.sessions.delete(key);
      const sid = r.sessionId ?? live.sessionId;
      if (sid) this.deps.approvals.expireForSession(sid);
      const e = this.deps.executions.get(executionId);
      if (!e || isTerminalExecution(e.status) || state.stopping) return;

      let changed: string[] = [];
      if (r.outcome === "completed") {
        changed = await this.deps.worktrees.changedFiles(live.cwd).catch(() => []);
      }
      for (const id of live.taskIds) {
        const t = this.deps.tasks.get(executionId, id);
        if (isTerminalTask(t.status)) continue;
        if (t.status !== "running") this.toRunning(executionId, t);
        this.applyOutcome(executionId, t, r, changed, sid);
      }
      await this.tick(executionId);
    });
  }

  private applyOutcome(
    executionId: string,
    t: Task,
    r: SessionResult,
    changed: string[],
    sessionId: string | null,
  ): void {
    switch (r.outcome) {
      case "completed": {
        const changedFiles = filesOwnedBy(changed, t.ownedPaths.includes("**") ? [] : t.ownedPaths);
        this.deps.tasks.transition(executionId, t.id, "reviewing", { sessionId });
        this.deps.tasks.transition(executionId, t.id, "completed", {
          sessionId,
          patch: { changedFiles },
          event: {
            type: "task.completed",
            summary: `${t.id} completed${r.resultText ? `: ${r.resultText}` : ""}`,
            payload: { changedFiles, usage: r.usage },
          },
        });
        this.deps.communication.record({
          from: { kind: "coordinator" },
          to: { kind: "user" },
          type: "result",
          text: `${t.id} completed. ${r.resultText ?? ""}`,
          executionId,
          taskId: t.id,
          sessionId,
        });
        return;
      }
      case "interrupted":
        this.deps.tasks.transition(executionId, t.id, "waiting_for_input", {
          sessionId,
          event: {
            type: "agent.waiting",
            summary: `${t.id} was interrupted and waits for input`,
            payload: { reason: "interrupted" },
          },
        });
        return;
      case "failed":
      case "stopped":
        this.fail(executionId, t.id, r.outcome === "stopped" ? "stopped" : "error", r.error);
        return;
    }
  }

  private toRunning(executionId: string, t: Task): void {
    if (t.status === "reviewing" || t.status === "waiting_for_input" || t.status === "blocked") {
      this.deps.tasks.transition(executionId, t.id, "running");
    }
  }

  /** All tasks terminal and nothing running → verifying → completed | failed. */
  private async maybeFinish(id: string): Promise<void> {
    const e = this.deps.executions.get(id);
    if (e?.status !== "running" || this.liveOf(id).sessions.size > 0) return;
    const tasks = this.deps.tasks.list(id);
    if (!tasks.every((t) => isTerminalTask(t.status))) return;
    const verifying = this.setStatus(e, "verifying");
    const verification = await this.verify(verifying);
    const final = verification.failedTaskIds.length > 0 ? "failed" : "completed";
    this.setStatus(this.get(id), final, { verification, endedAt: this.now() });
    // the verification is stored; per-execution runtime state is no longer needed
    this.live.delete(id);
  }

  private verify(e: Execution): Promise<Verification> {
    const paths = new Set(this.live.get(e.id)?.worktreePaths ?? []);
    if (e.worktreePath) paths.add(e.worktreePath);
    return buildVerification({
      tasks: this.deps.tasks.list(e.id),
      worktreePaths: [...paths],
      worktrees: this.deps.worktrees,
    });
  }

  // ---------------------------------------------------------------- helpers

  private conflictsOf(e: Execution, tasks: readonly Task[]): PlanConflict[] {
    const separate = e.mode === "multi_session" && e.config.parallelism !== "sequential";
    return detectConflicts(tasks, separate ? "separate_worktrees" : "serialised");
  }

  private requireConsent(
    e: Execution,
    input: ConsentInput,
    actor: string,
    action: string,
  ): ExecutionConfig {
    if (input.consent) {
      if (input.rememberConsentForProject) {
        this.deps.consent.setAlwaysAllow(e.projectId, true, actor);
      }
      return { ...e.config, modelAnalysisConsent: true };
    }
    if (e.config.modelAnalysisConsent || this.deps.consent.isAlwaysAllowed(e.projectId)) {
      return e.config;
    }
    this.deps.audit.record({
      actor,
      action,
      targetType: "execution",
      targetId: e.id,
      outcome: "denied",
      details: { reason: "model usage consent missing" },
    });
    throw new AppError(
      "APPROVAL_REQUIRED",
      "Model-backed analysis/planning consumes model usage and needs your consent",
    );
  }

  /** Mode/config changes invalidate an existing plan. */
  private backToConfiguring(e: Execution, patch: ExecutionPatch): Execution {
    if (e.status === "configuring") return this.update(e, patch);
    if (e.status === "plan_ready") this.deps.tasks.createPlan(e.id, e.mode ?? "multi_session", []);
    return this.setStatus(e, "configuring", patch);
  }

  private worktreeOf(e: Execution): string {
    if (!e.worktreePath) throw new AppError("CONFLICT", "Execution has no worktree");
    return e.worktreePath;
  }

  private setStatus(e: Execution, to: ExecutionStatus, patch: ExecutionPatch = {}): Execution {
    assertExecutionTransition(e.status, to);
    return this.update(e, { ...patch, status: to });
  }

  private update(e: Execution, patch: ExecutionPatch): Execution {
    this.deps.executions.update(e.id, patch);
    this.deps.emitter.entity("execution", e.id, { ...patch });
    return { ...e, ...patch };
  }

  private liveOf(id: string): LiveExecution {
    let l = this.live.get(id);
    if (!l) {
      l = { sessions: new Map(), worktreePaths: new Set(), stopping: false };
      this.live.set(id, l);
    }
    return l;
  }

  private serial<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
    if (this.closed)
      return Promise.reject(new AppError("CONFLICT", "Orchestrator is shutting down"));
    const prev = this.chains.get(id) ?? Promise.resolve();
    const run = prev.then(() =>
      this.closed
        ? Promise.reject(new AppError("CONFLICT", "Orchestrator is shutting down"))
        : fn(),
    );
    const settled = run.catch(() => undefined);
    this.chains.set(id, settled);
    void settled.then(() => {
      if (this.chains.get(id) === settled) this.chains.delete(id);
    });
    return run;
  }
}
