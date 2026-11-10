import {
  type AssignTaskInput,
  type ControlKind,
  type Execution,
  type ExecutionStatus,
  type Message,
  type MessageList,
  type MessageListQuery,
  type Participant,
  type PlanConflict,
  type RequestReviewInput,
  type RuntimeCapabilityProfile,
  type Session,
  type Task,
  type TaskControlInput,
  type TaskRef,
} from "@ubuliera/contracts";
import { ZodError } from "zod";

import { isTerminalExecution } from "./execution-state";
import { type Orchestrator } from "./orchestrator";
import { AppError } from "../../http/errors";
import { settleWithin } from "../../lib/timeout";
import { type AgentRepository } from "../agent-registry";
import { type CommunicationService } from "../communication-manager/communication.service";
import { type ApprovalService } from "../permission-manager/approval.service";
import { type AuditService } from "../permission-manager/audit.service";
import { assertAllSupport, assertControl } from "../runtime-manager/capability-gate";
import {
  CapabilityUnsupportedError,
  type ManagedRuntime,
} from "../runtime-manager/runtime-adapter";
import { type SessionRepository } from "../session-manager/session.repository";
import { isTerminalTask } from "../task-manager/task-state";
import { type NewTask, type TaskService } from "../task-manager/task.service";

export interface ControlDeps {
  /** the Orchestration from createOrchestration() */
  orchestration: {
    orchestrator: Orchestrator;
    tasks: TaskService;
    approvals: ApprovalService;
    communication: CommunicationService;
  };
  audit: Pick<AuditService, "record">;
  runtime: Pick<ManagedRuntime, "getHandle" | "environment">;
  sessions: Pick<SessionRepository, "get">;
  agents: Pick<AgentRepository, "get">;
}

/** What a held session receives when it is resumed. */
export const RESUME_MESSAGE = "Continue with your task from where you left off.";
/** Built-in role that reviews work on request (agents/roles.ts). */
export const REVIEWER_ROLE = "Code Reviewer";

/** Executions whose tasks can still be changed by controls. */
const ACTIVE: ReadonlySet<ExecutionStatus> = new Set(["running", "paused"]);
const USER: Participant = { kind: "user" };
/** how long a control waits for a restarted session to report its id */
const SESSION_ID_WAIT_MS = 5000;

interface AuditTarget {
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

const conflict = (message: string) => new AppError("CONFLICT", message);

/** Resolve `p` within `ms`, else null (never rejects). */
async function valueWithin<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let value: T | null = null;
  const inTime = await settleWithin(
    p.then((v) => {
      value = v;
    }),
    ms,
  );
  return inTime ? value : null;
}

/**
 * Human controls for running work (T112, FR-031, US3). Every control is capability-gated
 * (capability-gate.ts: unsupported ⇒ 422, observed sessions ⇒ 409) and audited with its actor and
 * outcome. State changes run through the Orchestrator's per-execution chain, which also owns the
 * task → session mapping, so controls never race the scheduler.
 */
export class ControlService {
  constructor(private readonly deps: ControlDeps) {}

  private get o() {
    return this.deps.orchestration.orchestrator;
  }

  private get tasks() {
    return this.deps.orchestration.tasks;
  }

  // ---------------------------------------------------------------- executions

  /** Stop every runtime (each bounded, ≤ 5 s overall) and cancel open work → `cancelled`. */
  stopExecution(id: string, actor: string): Promise<Execution> {
    // Orchestrator.stop audits its own success
    return this.audited(
      actor,
      { action: "execution.stop", targetType: "execution", targetId: id },
      () => this.o.stop(id, actor),
      { recordSuccess: false },
    );
  }

  /** "Interrupt & hold": only when every runtime of the execution can interrupt + resume. */
  pauseExecution(id: string, actor: string): Promise<Execution> {
    return this.audited(
      actor,
      { action: "execution.pause", targetType: "execution", targetId: id },
      async () => {
        const e = this.o.get(id);
        if (e.status !== "running") {
          throw conflict(`Execution is ${e.status}; only a running execution can be held`);
        }
        assertAllSupport(await this.profilesOf(id), "pause");
        return this.o.pause(id);
      },
    );
  }

  resumeExecution(id: string, actor: string): Promise<Execution> {
    return this.audited(
      actor,
      { action: "execution.resume", targetType: "execution", targetId: id },
      async () => {
        const e = this.o.get(id);
        if (e.status !== "paused") {
          throw conflict(`Execution is ${e.status}; only a held execution can resume`);
        }
        assertAllSupport(await this.profilesOf(id), "resume");
        return this.o.resume(id, RESUME_MESSAGE);
      },
    );
  }

  // ---------------------------------------------------------------- tasks

  cancelTask(ref: TaskRef, input: TaskControlInput, actor: string): Promise<Task> {
    return this.audited(actor, this.taskTarget("task.cancel", ref, input), async () => {
      const task = await this.o.exclusive(ref.executionId, async () => {
        const e = this.o.get(ref.executionId);
        const t = this.tasks.get(e.id, ref.taskId);
        if (isTerminalExecution(e.status)) throw conflict(`Execution is already ${e.status}`);
        if (isTerminalTask(t.status)) throw conflict(`${t.id} is already ${t.status}`);
        await this.o.detachTask(e.id, t.id);
        return this.tasks.transition(e.id, t.id, "cancelled");
      });
      this.o.schedule(ref.executionId);
      return task;
    });
  }

  /** New attempt of a failed/cancelled task: attempt + 1, linked via previousAttemptId. */
  retryTask(ref: TaskRef, input: TaskControlInput, actor: string): Promise<Task> {
    return this.audited(
      actor,
      this.taskTarget("task.retry", ref, input),
      async () => {
        const task = await this.o.exclusive(ref.executionId, () => {
          const e = this.activeExecution(ref.executionId);
          const all = this.tasks.list(e.id);
          const t = this.tasks.get(e.id, ref.taskId);
          if (t.status !== "failed" && t.status !== "cancelled") {
            throw conflict(
              `Only a failed or cancelled task can be retried (${t.id} is ${t.status})`,
            );
          }
          const newer = all.find((x) => x.previousAttemptId === t.id);
          if (newer) throw conflict(`${t.id} was already retried as ${newer.id}`);
          const dependsOn = t.dependsOn.map((d) => latestAttempt(all, d));
          const dead = dependsOn.filter((d) => {
            const s = all.find((x) => x.id === d)?.status;
            return s === "failed" || s === "cancelled";
          });
          if (dead.length > 0) {
            throw conflict(`${t.id} depends on ${dead.join(", ")}, which did not complete`);
          }
          const next: NewTask = {
            title: t.title,
            description: t.description,
            assignedAgentRole: t.assignedAgentRole,
            mode: t.mode,
            mechanismReason: t.mechanismReason,
            priority: t.priority,
            dependsOn,
            ownedPaths: t.ownedPaths,
            riskClass: t.riskClass,
            attempt: t.attempt + 1,
            previousAttemptId: t.id,
          };
          return this.release(e, this.tasks.add(e.id, next));
        });
        this.o.schedule(ref.executionId);
        return task;
      },
      { details: (t) => ({ newTaskId: t.id, attempt: t.attempt }) },
    );
  }

  /** Assign an additional task to a running execution (DAG + conflict checks; risky ⇒ approval). */
  async assignTask(executionId: string, input: AssignTaskInput, actor: string): Promise<Task> {
    const r = await this.audited(
      actor,
      {
        action: "task.assign",
        targetType: "execution",
        targetId: executionId,
        details: { title: input.title, riskClass: input.riskClass, dependsOn: input.dependsOn },
      },
      async () => {
        const out = await this.o.exclusive(executionId, () => {
          const e = this.activeExecution(executionId);
          const all = this.tasks.list(e.id);
          for (const dep of input.dependsOn) {
            const d = all.find((t) => t.id === dep);
            if (!d) throw invalidDependency(`Unknown task ${dep}`);
            if (d.status === "failed" || d.status === "cancelled") {
              throw invalidDependency(`${dep} is ${d.status}; the new task could never start`);
            }
          }
          const added = this.tasks.add(e.id, {
            title: input.title,
            description: input.description,
            assignedAgentRole: input.assignedAgentRole,
            mode: e.mode ?? "multi_session",
            mechanismReason: null,
            priority: input.priority,
            dependsOn: [...new Set(input.dependsOn)],
            ownedPaths: input.ownedPaths.length > 0 ? input.ownedPaths : ["**"],
            riskClass: input.riskClass,
            attempt: 1,
            previousAttemptId: null,
          });
          const conflicts = this.o
            .conflicts(e, [...all, added])
            .filter((c) => c.taskIds.includes(added.id));
          return { task: this.release(e, added), conflicts };
        });
        this.o.schedule(executionId);
        return out;
      },
      {
        details: (o: { task: Task; conflicts: PlanConflict[] }) => ({
          taskId: o.task.id,
          status: o.task.status,
          conflicts: o.conflicts.map((c) => ({ taskIds: c.taskIds, resolution: c.resolution })),
        }),
      },
    );
    return r.task;
  }

  /** A Code Reviewer task that runs after the reviewed task, plus a review_request message. */
  requestReview(ref: TaskRef, input: RequestReviewInput, actor: string): Promise<Task> {
    return this.audited(
      actor,
      this.taskTarget("task.review", ref, input.note ? { note: input.note } : {}),
      async () => {
        const task = await this.o.exclusive(ref.executionId, () => {
          const e = this.activeExecution(ref.executionId);
          const t = this.tasks.get(e.id, ref.taskId);
          if (t.status === "failed" || t.status === "cancelled") {
            throw conflict(`${t.id} is ${t.status}; there is no work to review`);
          }
          const added = this.tasks.add(e.id, {
            title: `Review ${t.id}: ${t.title}`.slice(0, 200),
            description: [
              `Review the changes made for ${t.id} (${t.title}) as the ${REVIEWER_ROLE}.`,
              input.note ? `Reviewer note from the user: ${input.note}` : null,
              "Report findings with file and line; fix only clear defects inside the task scope.",
            ]
              .filter((l): l is string => l !== null)
              .join("\n"),
            assignedAgentRole: REVIEWER_ROLE,
            mode: t.mode,
            mechanismReason: null,
            priority: t.priority,
            dependsOn: [t.id],
            ownedPaths: t.ownedPaths,
            riskClass: "normal",
            attempt: 1,
            previousAttemptId: null,
          });
          this.deps.orchestration.communication.record({
            from: USER,
            to: { kind: "coordinator" },
            type: "review_request",
            text: `Review of ${t.id} requested from the ${REVIEWER_ROLE} (${added.id})${
              input.note ? `: ${input.note}` : ""
            }`,
            executionId: e.id,
            taskId: t.id,
            sessionId: null,
          });
          return this.release(e, added);
        });
        this.o.schedule(ref.executionId);
        return task;
      },
      { details: (t) => ({ reviewTaskId: t.id }) },
    );
  }

  // ---------------------------------------------------------------- sessions & agents

  stopSession(id: string, actor: string): Promise<Session> {
    return this.audited(actor, sessionTarget("session.stop", id), async () => {
      const s = this.controllable(id, "stop");
      if (!(await this.o.stopSession(id))) {
        const handle = this.handleOf(s);
        await settleWithin(handle.stop(), this.o.stopTimeoutMs);
      }
      return this.session(id);
    });
  }

  interruptSession(id: string, actor: string): Promise<Session> {
    return this.audited(actor, sessionTarget("session.interrupt", id), async () => {
      const s = this.controllable(id, "interrupt");
      await settleWithin(this.handleOf(s).interrupt(), this.o.stopTimeoutMs);
      return this.session(id);
    });
  }

  /** Resume a held (interrupted) session; its tasks run again. */
  resumeSession(id: string, actor: string): Promise<Session> {
    return this.audited(actor, sessionTarget("session.resume", id), async () => {
      const s = this.controllable(id, "resume");
      if (!this.o.locateSession(id)?.held || !(await this.o.resumeSession(id, RESUME_MESSAGE))) {
        throw conflict("Session is not on hold");
      }
      this.recordDelivered(s, RESUME_MESSAGE, { kind: "agent", agentId: s.id });
      return this.session(id);
    });
  }

  /** Stop the runtime and start a new session for the same open tasks (conversation resumed). */
  restartSession(id: string, actor: string): Promise<Session> {
    return this.audited(
      actor,
      sessionTarget("session.restart", id),
      async () => {
        this.controllable(id, "restart");
        const restarted = await this.o.restartSession(id);
        if (!restarted) {
          throw conflict("Only a session working on a task of an active execution can restart");
        }
        const next = await valueWithin(restarted.sessionId, SESSION_ID_WAIT_MS);
        return (next ? this.deps.sessions.get(next) : undefined) ?? this.session(id);
      },
      { details: (s) => ({ newSessionId: s.id }) },
    );
  }

  /** Message to a session's main agent (FR-027): delivered by the runtime, then recorded. */
  sendToSession(id: string, text: string, actor: string): Promise<Message> {
    return this.audited(actor, sessionTarget("session.message", id), async () => {
      const s = this.controllable(id, "send_message", "main");
      return this.deliver(s, text, { kind: "agent", agentId: s.id });
    });
  }

  /**
   * Message to an agent. The main/lead agent receives it directly; other agents of the session
   * are reached through the main agent (only when the runtime accepts messages beyond the lead).
   */
  sendToAgent(agentId: string, text: string, actor: string): Promise<Message> {
    return this.audited(
      actor,
      { action: "agent.message", targetType: "agent", targetId: agentId },
      async () => {
        const a = this.deps.agents.get(agentId);
        if (!a) throw new AppError("NOT_FOUND", "Agent not found");
        const direct = a.kind === "main" || a.kind === "team_lead";
        const s = this.controllable(a.sessionId, "send_message", direct ? "main" : "agent");
        const to: Participant = { kind: "agent", agentId: a.id };
        if (direct) return this.deliver(s, text, to);
        const relay = `Message from the user for your ${a.kind} "${a.name}" (${a.id}); pass it on: ${text}`;
        return this.deliver(s, text, to, relay);
      },
    );
  }

  messages(q: MessageListQuery): MessageList {
    return this.deps.orchestration.communication.page(q);
  }

  // ---------------------------------------------------------------- helpers

  private async deliver(
    s: Session,
    text: string,
    to: Participant,
    deliver?: string,
  ): Promise<Message> {
    // a held session continues with the message, and the orchestrator watches the new turn
    if (this.o.locateSession(s.id)?.held && (await this.o.resumeSession(s.id, deliver ?? text))) {
      return this.recordDelivered(s, text, to);
    }
    return this.deps.orchestration.communication.sendToSession({
      sessionId: s.id,
      text,
      ...(deliver === undefined ? {} : { deliver }),
      from: USER,
      to,
      type: "instruction",
      executionId: s.executionId,
      taskId: s.currentTaskId,
    });
  }

  private recordDelivered(s: Session, text: string, to: Participant): Message {
    return this.deps.orchestration.communication.record({
      from: USER,
      to,
      type: "instruction",
      text,
      executionId: s.executionId,
      taskId: s.currentTaskId,
      sessionId: s.id,
    });
  }

  private session(id: string): Session {
    const s = this.deps.sessions.get(id);
    if (!s) throw new AppError("NOT_FOUND", "Session not found");
    return s;
  }

  /** Session row that this control may act on (404 / 409 observed / 422 / 409 ended). */
  private controllable(id: string, control: ControlKind, target?: "main" | "agent"): Session {
    const s = this.session(id);
    assertControl(s, control, target ? { target } : {});
    if (s.status === "stopped") throw conflict("Session has already stopped");
    return s;
  }

  private handleOf(s: Session) {
    const h = this.deps.runtime.getHandle(s.id);
    if (!h) throw conflict("Session is not running under this Ubuliera server");
    return h;
  }

  private activeExecution(id: string): Execution {
    const e = this.o.get(id);
    if (!ACTIVE.has(e.status)) {
      throw conflict(`Execution is ${e.status}; its tasks can no longer change`);
    }
    return e;
  }

  /** A new task starts queued, or pending behind a human approval when it is risky. */
  private release(e: Execution, t: Task): Task {
    if (t.riskClass === "normal") return this.tasks.transition(e.id, t.id, "queued");
    this.deps.orchestration.approvals.createTaskApproval({
      executionId: e.id,
      taskId: t.id,
      riskClass: t.riskClass,
      title: t.title,
    });
    return t;
  }

  /** Capability profile of every live runtime of the execution. */
  private async profilesOf(executionId: string): Promise<RuntimeCapabilityProfile[]> {
    const live = this.o.liveSessions(executionId);
    let env: Awaited<ReturnType<ManagedRuntime["environment"]>> | null = null;
    const out: RuntimeCapabilityProfile[] = [];
    for (const s of live) {
      const row = s.sessionId ? this.deps.sessions.get(s.sessionId) : undefined;
      if (row) {
        out.push(row.capabilities);
        continue;
      }
      env ??= await this.deps.runtime.environment();
      const caps = env.runtimes.find((r) => r.kind === s.kind)?.capabilities;
      if (caps) out.push(caps);
    }
    return out;
  }

  private taskTarget(action: string, ref: TaskRef, details: Record<string, unknown>): AuditTarget {
    return {
      action,
      targetType: "task",
      targetId: `${ref.executionId}:${ref.taskId}`,
      details,
    };
  }

  /**
   * Run a control and audit it: success, `denied` (refused: 4xx), or `failed` (unexpected).
   */
  private async audited<T>(
    actor: string,
    target: AuditTarget,
    fn: () => Promise<T>,
    opts: { recordSuccess?: boolean; details?: (r: T) => Record<string, unknown> } = {},
  ): Promise<T> {
    const base = {
      actor,
      action: target.action,
      targetType: target.targetType,
      targetId: target.targetId,
    };
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      const refused =
        err instanceof AppError ||
        err instanceof CapabilityUnsupportedError ||
        err instanceof ZodError;
      this.deps.audit.record({
        ...base,
        outcome: refused ? "denied" : "failed",
        details: { ...target.details, reason: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
    if (opts.recordSuccess !== false) {
      this.deps.audit.record({
        ...base,
        outcome: "success",
        details: { ...target.details, ...opts.details?.(result) },
      });
    }
    return result;
  }
}

function sessionTarget(action: string, id: string): AuditTarget {
  return { action, targetType: "session", targetId: id };
}

function invalidDependency(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message, [{ path: "dependsOn", message }]);
}

/** Follow the retry chain of `id` to its newest attempt. */
function latestAttempt(all: readonly Task[], id: string): string {
  let current = id;
  const seen = new Set<string>();
  for (;;) {
    seen.add(current);
    const newer = all.find((t) => t.previousAttemptId === current);
    if (!newer || seen.has(newer.id)) return current;
    current = newer.id;
  }
}

export function createControls(deps: ControlDeps): ControlService {
  return new ControlService(deps);
}
