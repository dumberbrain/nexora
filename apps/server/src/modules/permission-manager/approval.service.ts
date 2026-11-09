import {
  type ApprovalDecisionInput,
  type ApprovalRequest,
  type ApprovalStatus,
  type RiskClass,
} from "@nexora/contracts";

import { ApprovalRepository } from "./approval.repository";
import { type AuditService } from "./audit.service";
import { type Db } from "../../db/client";
import { AppError } from "../../http/errors";
import { redact } from "../../lib/redactor";
import { newId } from "../../lib/ulid";
import { type DomainEmitter } from "../event-manager/domain-emitter";
import { type ApprovalGate } from "../runtime-manager/runtime-adapter";

type Verdict = "allow" | "deny";
type ToolRequest = Parameters<ApprovalGate["request"]>[0];

export interface ApprovalServiceDeps {
  db: Db;
  audit: AuditService;
  emitter: DomainEmitter;
  now?: () => number;
}

/** orchestrator operation name for "may this risky task start?" requests */
export const TASK_START_ACTION = "task.start";
/** operation name of a workflow `approval` node */
export const WORKFLOW_APPROVAL_ACTION = "workflow.approval";

/**
 * Approval gate (T093, FR-033). Requests are persisted (redacted) and stay pending until a human
 * decides — there is deliberately no timer anywhere in this class. A dead session expires its
 * pending requests, which resolves them as deny. Every decision is audited with its actor.
 */
export class ApprovalService implements ApprovalGate {
  private readonly repo: ApprovalRepository;
  private readonly waiting = new Map<string, (v: Verdict) => void>();
  private readonly listeners = new Set<(a: ApprovalRequest) => void>();
  private readonly now: () => number;

  constructor(private readonly deps: ApprovalServiceDeps) {
    this.repo = new ApprovalRepository(deps.db);
    this.now = deps.now ?? Date.now;
  }

  /** Tool-call approval for a running session; resolves only on a human decision or expiry. */
  request(req: ToolRequest): Promise<Verdict> {
    const a = this.insert({
      executionId: req.executionId,
      taskId: req.taskId,
      sessionId: req.sessionId,
      agentId: req.agentId,
      action: req.toolName,
      riskClass: req.riskClass,
      details: { toolName: req.toolName, input: req.input, reason: req.reason },
    });
    return new Promise((resolve) => this.waiting.set(a.id, resolve));
  }

  /** "May this risky task start?" — decided in the approvals inbox (no session yet). */
  createTaskApproval(req: {
    executionId: string;
    taskId: string;
    riskClass: RiskClass;
    title: string;
  }): ApprovalRequest {
    return this.insert({
      executionId: req.executionId,
      taskId: req.taskId,
      sessionId: null,
      agentId: null,
      action: TASK_START_ACTION,
      riskClass: req.riskClass,
      details: { title: req.title, reason: `Task ${req.taskId} is classified ${req.riskClass}` },
    });
  }

  /**
   * Workflow `approval` node (US5): pending until a human decides — never by timeout. The
   * decision promise resolves deny when the request is expired (run cancelled, execution stopped).
   */
  requestWorkflowApproval(req: {
    executionId: string;
    nodeId: string;
    label: string;
    message: string;
    riskClass: RiskClass;
  }): { approval: ApprovalRequest; decision: Promise<Verdict> } {
    const approval = this.insert({
      executionId: req.executionId,
      taskId: null,
      sessionId: null,
      agentId: null,
      action: WORKFLOW_APPROVAL_ACTION,
      riskClass: req.riskClass,
      details: { nodeId: req.nodeId, title: req.label, reason: req.message },
    });
    const decision = new Promise<Verdict>((resolve) => this.waiting.set(approval.id, resolve));
    return { approval, decision };
  }

  /** Expire one pending request (deny); false when it was no longer pending. */
  expireRequest(id: string, reason: string): boolean {
    const a = this.repo.get(id);
    return a?.status === "pending" ? this.expire([a], reason) > 0 : false;
  }

  list(status?: ApprovalStatus, executionId?: string): ApprovalRequest[] {
    return this.repo.list({
      ...(status ? { status } : {}),
      ...(executionId ? { executionId } : {}),
    });
  }

  get(id: string): ApprovalRequest {
    const a = this.repo.get(id);
    if (!a) throw new AppError("NOT_FOUND", "Approval request not found");
    return a;
  }

  decide(id: string, input: ApprovalDecisionInput, actor: string): ApprovalRequest {
    const existing = this.get(id);
    const status = input.decision === "approve" ? "approved" : "rejected";
    const decided = this.repo.decide(id, {
      status,
      decidedBy: actor,
      decidedAt: this.now(),
      note: input.note ?? null,
    });
    if (!decided) {
      this.deps.audit.record({
        actor,
        action: "approval.decide",
        targetType: "approval",
        targetId: id,
        outcome: "failed",
        details: { reason: `already ${existing.status}` },
      });
      throw new AppError("CONFLICT", `Approval request is already ${existing.status}`);
    }
    this.deps.audit.record({
      actor,
      action: "approval.decide",
      targetType: "approval",
      targetId: id,
      outcome: "success",
      details: { decision: input.decision, action: decided.action, taskId: decided.taskId },
    });
    this.settle(decided, status === "approved" ? "allow" : "deny");
    return decided;
  }

  /** Session died: its pending requests become expired_session (deny). Returns how many. */
  expireForSession(sessionId: string, reason = "session ended"): number {
    return this.expire(this.repo.list({ status: "pending", sessionId }), reason);
  }

  /** Execution stopped/cancelled: nothing of it may still wait for a decision. */
  expireForExecution(executionId: string, reason = "execution stopped"): number {
    return this.expire(this.repo.list({ status: "pending", executionId }), reason);
  }

  /** Task ids whose `task.start` approval was granted. */
  approvedTaskIds(executionId: string): Set<string> {
    return new Set(
      this.repo
        .list({ executionId, status: "approved" })
        .filter((a) => a.action === TASK_START_ACTION && a.taskId !== null)
        .map((a) => a.taskId as string),
    );
  }

  onDecided(listener: (a: ApprovalRequest) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private insert(
    a: Omit<ApprovalRequest, "id" | "status" | "decidedBy" | "decidedAt" | "note" | "createdAt">,
  ): ApprovalRequest {
    const now = this.now();
    const row = this.repo.insert({
      ...a,
      id: newId(now),
      details: redact(a.details),
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      note: null,
      createdAt: now,
    });
    this.deps.emitter.event({
      type: "permission.requested",
      executionId: row.executionId,
      sessionId: row.sessionId,
      agentId: row.agentId,
      taskId: row.taskId,
      severity: "warn",
      summary: `Approval needed: ${row.action} (${row.riskClass})`,
      payload: {
        approvalId: row.id,
        action: row.action,
        riskClass: row.riskClass,
        details: row.details,
      },
    });
    this.deps.emitter.entity("approval", row.id, { ...row });
    return row;
  }

  private expire(pending: ApprovalRequest[], reason: string): number {
    let n = 0;
    for (const p of pending) {
      const done = this.repo.decide(p.id, {
        status: "expired_session",
        decidedBy: null,
        decidedAt: this.now(),
        note: reason,
      });
      if (!done) continue;
      n += 1;
      this.deps.audit.record({
        actor: "system",
        action: "approval.expire",
        targetType: "approval",
        targetId: p.id,
        outcome: "success",
        details: { reason, sessionId: p.sessionId, taskId: p.taskId },
      });
      this.settle(done, "deny");
    }
    return n;
  }

  private settle(a: ApprovalRequest, verdict: Verdict): void {
    this.deps.emitter.event({
      type: "permission.decided",
      executionId: a.executionId,
      sessionId: a.sessionId,
      agentId: a.agentId,
      taskId: a.taskId,
      summary: `${a.action}: ${a.status}${a.decidedBy ? ` by ${a.decidedBy}` : ""}`,
      payload: { approvalId: a.id, status: a.status, decidedBy: a.decidedBy, note: a.note },
    });
    this.deps.emitter.entity("approval", a.id, {
      status: a.status,
      decidedBy: a.decidedBy,
      decidedAt: a.decidedAt,
      note: a.note,
    });
    const resolve = this.waiting.get(a.id);
    this.waiting.delete(a.id);
    resolve?.(verdict);
    for (const l of this.listeners) {
      try {
        l(a);
      } catch {
        /* listeners must not break a decision */
      }
    }
  }
}
