import { type ExecutionConfig } from "@ubuliera/contracts";

import {
  type AgentDefinitionInput,
  type ApprovalGate,
  type ManagedRuntime,
  type SessionHandle,
  type StartSessionInput,
} from "../../runtime-manager/runtime-adapter";
import { type NodeContext, type NodeOutcome } from "../executor";

/** The execution a workflow's sessions run in (always its Ubuliera worktree, never the project root). */
export interface WorkflowSessionTarget {
  executionId: string;
  projectRoot: string;
  worktreePath: string;
  config: Pick<
    ExecutionConfig,
    "approvalCheckpoints" | "idleTimeoutMs" | "turnTimeoutMs" | "budgetUsd"
  >;
  permissionBypass: boolean;
}

export interface SessionNodeDeps {
  runtime: Pick<ManagedRuntime, "startManagedSession">;
  approvals: ApprovalGate;
  target: WorkflowSessionTarget;
  /** live session bookkeeping (orchestrator controls see workflow sessions); null = ended */
  track(nodeId: string, handle: SessionHandle | null): void;
}

export interface SessionSpec {
  prompt: string;
  ownedPaths?: string[];
  agents?: Record<string, AgentDefinitionInput>;
  allowedTools?: string[];
}

/** Shared context lines for a workflow step prompt. */
export function stepContext(ctx: NodeContext): string[] {
  return [
    `You are running step "${ctx.node.label}" of an automated Ubuliera workflow, inside an isolated git worktree.`,
    ...(ctx.prompt.trim() ? [`Overall goal of the workflow: ${ctx.prompt.trim()}`] : []),
  ];
}

/**
 * Run one managed session for a workflow node attempt and wait for its turn to end. Aborting the
 * run stops the session. Anything but a completed turn is a failed attempt.
 */
export async function runSessionNode(
  deps: SessionNodeDeps,
  ctx: NodeContext,
  spec: SessionSpec,
): Promise<NodeOutcome> {
  if (ctx.signal.aborted) throw new Error("cancelled");
  const { target } = deps;
  const input: StartSessionInput = {
    executionId: target.executionId,
    taskId: null,
    projectRoot: target.projectRoot,
    cwd: target.worktreePath,
    prompt: spec.prompt,
    ownedPaths: spec.ownedPaths ?? [],
    permissionMode: target.permissionBypass
      ? "bypassPermissions"
      : target.config.approvalCheckpoints
        ? "default"
        : "acceptEdits",
    ...(spec.agents ? { agents: spec.agents } : {}),
    ...(spec.allowedTools ? { allowedTools: spec.allowedTools } : {}),
    ...(target.config.budgetUsd === undefined ? {} : { maxBudgetUsd: target.config.budgetUsd }),
  };
  const handle = await deps.runtime.startManagedSession(
    {
      ...input,
      executionMode: "workflow",
      idleTimeoutMs: target.config.idleTimeoutMs,
      turnTimeoutMs: target.config.turnTimeoutMs,
    },
    { approvals: deps.approvals },
  );
  deps.track(ctx.node.id, handle);
  void handle.sessionId.then(
    (sid) => ctx.setSession(sid),
    () => undefined,
  );
  const onAbort = () => void handle.stop().catch(() => undefined);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const r = await handle.done;
    if (r.sessionId) ctx.setSession(r.sessionId);
    if (r.outcome !== "completed") {
      throw new Error(r.error ?? `session ${r.outcome}`);
    }
    return { output: r.resultText };
  } finally {
    ctx.signal.removeEventListener("abort", onAbort);
    deps.track(ctx.node.id, null);
  }
}
