import {
  type EntityChanged,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeChangedPayload,
  type WorkflowNodeRun,
  type WorkflowRun,
} from "@ubuliera/contracts";

import { compileCondition, type FinishedNode } from "./condition-evaluator";
import { indexGraph } from "./graph-validator";
import { newId } from "../../lib/ulid";
import { type DomainEventInput } from "../event-manager/domain-emitter";

/**
 * Workflow executor (T128, research R6): a topological scheduler over a validated graph with
 * dead-path elimination. Every edge — including the implicit `onError: { goto }` error edge — is
 * decided `taken` or `dead` when its source settles; a node runs once all its incoming edges are
 * decided and at least one is taken, and is `skipped` when all are dead. That single rule gives
 * fork/join parallelism, condition branches, error edges and merges after branches.
 *
 * Session-backed nodes (agent, skill, mcp_tool) and approvals run through injected
 * {@link NodeExecutors}; start/end/fork/join are instantaneous, conditions are evaluated by the
 * sandboxed condition evaluator. Every attempt is a WorkflowNodeRun row.
 */

export type NodeRunStatus = WorkflowNodeRun["status"];
export type RunStatus = WorkflowRun["status"];
export type FinalRunStatus = Extract<RunStatus, "completed" | "failed" | "cancelled">;

export interface WorkflowRunStore {
  updateRun(
    id: string,
    patch: Partial<Pick<WorkflowRun, "status" | "startedAt" | "endedAt">>,
  ): void;
  insertNodeRun(row: WorkflowNodeRun): void;
  updateNodeRun(
    id: string,
    patch: Partial<Pick<WorkflowNodeRun, "status" | "sessionId" | "outputSummary" | "error">>,
  ): void;
}

/** DomainEmitter-compatible sink (persisted events + entity patches for the UI). */
export interface WorkflowEventSink {
  event(input: DomainEventInput): unknown;
  entity(kind: EntityChanged["kind"], id: string, patch: Record<string, unknown>): void;
}

export interface NodeContext {
  run: WorkflowRun;
  node: WorkflowNode;
  attempt: number;
  /** the run's prompt (context for agent/skill/MCP nodes) */
  prompt: string;
  /** aborted when the run is cancelled or failed — executors must stop their work */
  signal: AbortSignal;
  /** record the managed session that works on this attempt */
  setSession(sessionId: string): void;
  /** the attempt now waits for a human decision */
  waiting(): void;
}

export interface NodeOutcome {
  output: string | null;
}

/** Throws (or rejects) when the attempt failed. */
export type NodeExecutor = (ctx: NodeContext) => Promise<NodeOutcome>;
export type ExecutableKind = "agent" | "skill" | "mcp_tool" | "approval";
export type NodeExecutors = Record<ExecutableKind, NodeExecutor>;

export interface WorkflowExecutorDeps {
  store: WorkflowRunStore;
  events: WorkflowEventSink;
  executors: NodeExecutors;
  /** max concurrently running session nodes (agent/skill/mcp_tool); default 4 */
  maxParallel?: number;
  now?: () => number;
  /** backoff wait; rejects when the signal aborts (default: abortable timer) */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface WorkflowRunInput {
  run: WorkflowRun;
  graph: WorkflowGraph;
  prompt: string;
  signal: AbortSignal;
}

const SESSION_KINDS: ReadonlySet<WorkflowNode["kind"]> = new Set(["agent", "skill", "mcp_tool"]);
const MAX_TEXT = 2000;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const clip = (s: string | null): string | null =>
  s === null ? null : s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s;

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

interface Incoming {
  key: string;
}
interface Outgoing {
  key: string;
  target: string;
  branch?: "true" | "false";
  error: boolean;
}

type Settled =
  | { kind: "completed"; output: string | null }
  | { kind: "failed"; error: string }
  | { kind: "cancelled" };

/** Run a workflow to its end. Resolves with the final run status; never rejects for node errors. */
export async function executeWorkflow(
  deps: WorkflowExecutorDeps,
  input: WorkflowRunInput,
): Promise<FinalRunStatus> {
  return new WorkflowExecution(deps, input).execute();
}

class WorkflowExecution {
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly maxParallel: number;
  private readonly nodes = new Map<string, WorkflowNode>();
  private readonly incoming = new Map<string, Incoming[]>();
  private readonly outgoing = new Map<string, Outgoing[]>();
  private readonly ancestors = new Map<string, Set<string>>();
  private readonly edge = new Map<string, "taken" | "dead">();
  private readonly state = new Map<string, "pending" | "queued" | "running" | "done">();
  private readonly finished = new Map<string, FinishedNode>();
  /** nodes whose current attempt waits for approval */
  private readonly waitingNodes = new Set<string>();
  private readonly queue: string[] = [];
  private readonly inner = new AbortController();
  private running = 0;
  private sessionsRunning = 0;
  private fatal: string | null = null;
  private runStatus: RunStatus;
  private resolveDone!: (s: FinalRunStatus) => void;
  private readonly done = new Promise<FinalRunStatus>((r) => (this.resolveDone = r));

  constructor(
    private readonly deps: WorkflowExecutorDeps,
    private readonly input: WorkflowRunInput,
  ) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? abortableSleep;
    this.maxParallel = Math.max(1, deps.maxParallel ?? 4);
    this.runStatus = input.run.status;
    const idx = indexGraph(input.graph);
    for (const [id, n] of idx.nodes) {
      this.nodes.set(id, n);
      this.incoming.set(id, []);
      this.outgoing.set(id, []);
      this.state.set(id, "pending");
    }
    for (const e of input.graph.edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) continue;
      const key = `edge:${e.id}`;
      this.outgoing.get(e.source)?.push({
        key,
        target: e.target,
        error: false,
        ...(e.branch ? { branch: e.branch } : {}),
      });
      this.incoming.get(e.target)?.push({ key });
    }
    for (const n of this.nodes.values()) {
      if (typeof n.onError !== "object" || !this.nodes.has(n.onError.goto)) continue;
      const key = `error:${n.id}`;
      this.outgoing.get(n.id)?.push({ key, target: n.onError.goto, error: true });
      this.incoming.get(n.onError.goto)?.push({ key });
    }
    for (const id of this.nodes.keys()) {
      const seen = new Set<string>();
      const stack = [...(idx.in.get(id) ?? [])];
      while (stack.length > 0) {
        const p = stack.pop() as string;
        if (seen.has(p)) continue;
        seen.add(p);
        stack.push(...(idx.in.get(p) ?? []));
      }
      this.ancestors.set(id, seen);
    }
  }

  async execute(): Promise<FinalRunStatus> {
    const { run, signal } = this.input;
    const onAbort = () => this.inner.abort();
    if (signal.aborted) this.inner.abort();
    else signal.addEventListener("abort", onAbort, { once: true });

    this.setRun("running", { startedAt: this.now() });
    this.deps.events.event({
      type: "workflow.started",
      executionId: run.executionId,
      summary: `Workflow run started (${this.nodes.size} nodes)`,
      payload: { runId: run.id, versionId: run.versionId },
    });
    this.pump();
    const final = await this.done;
    signal.removeEventListener("abort", onAbort);
    this.setRun(final, { endedAt: this.now() });
    this.deps.events.event({
      type: "workflow.completed",
      executionId: run.executionId,
      severity: final === "completed" ? "info" : final === "failed" ? "error" : "warn",
      summary: `Workflow run ${final}${this.fatal ? `: ${this.fatal}` : ""}`,
      payload: { runId: run.id, status: final, error: this.fatal },
    });
    return final;
  }

  // ------------------------------------------------------------------ scheduling

  /** Launch or skip every node whose inputs are decided; finish when nothing can move. */
  private pump(): void {
    if (!this.inner.signal.aborted) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const [id, s] of this.state) {
          if (s !== "pending") continue;
          const ins = this.incoming.get(id) ?? [];
          if (!ins.every((i) => this.edge.has(i.key))) continue;
          changed = true;
          if (ins.length === 0 || ins.some((i) => this.edge.get(i.key) === "taken")) {
            this.state.set(id, "queued");
            this.queue.push(id);
          } else {
            this.skip(id);
          }
        }
      }
      this.drainQueue();
    }
    if (this.running === 0) this.finish();
  }

  private drainQueue(): void {
    for (let i = 0; i < this.queue.length;) {
      const id = this.queue[i] as string;
      const node = this.nodes.get(id) as WorkflowNode;
      const isSession = SESSION_KINDS.has(node.kind);
      if (isSession && this.sessionsRunning >= this.maxParallel) {
        i += 1;
        continue;
      }
      this.queue.splice(i, 1);
      this.launch(node, isSession);
    }
  }

  private launch(node: WorkflowNode, isSession: boolean): void {
    this.state.set(node.id, "running");
    this.running += 1;
    if (isSession) this.sessionsRunning += 1;
    void this.runNode(node)
      .catch((err: unknown): Settled => ({ kind: "failed", error: errorText(err) }))
      .then((result) => {
        this.running -= 1;
        if (isSession) this.sessionsRunning -= 1;
        this.state.set(node.id, "done");
        try {
          this.settle(node, result);
          this.pump();
        } catch (err) {
          // persistence broke (e.g. the database closed during shutdown): end the run
          this.fatal ??= errorText(err);
          this.inner.abort();
          this.resolveDone("failed");
        }
      });
  }

  private finish(): void {
    if (this.inner.signal.aborted && this.fatal === null) {
      this.resolveDone("cancelled");
      return;
    }
    this.resolveDone(this.fatal !== null ? "failed" : "completed");
  }

  /** Decide the node's outgoing edges from its result. */
  private settle(node: WorkflowNode, r: Settled): void {
    const outs = this.outgoing.get(node.id) ?? [];
    const decide = (pick: (o: Outgoing) => boolean) => {
      for (const o of outs) this.edge.set(o.key, pick(o) ? "taken" : "dead");
    };
    if (r.kind === "cancelled") return;
    if (r.kind === "completed") {
      this.finished.set(node.id, { status: "completed", output: r.output });
      if (node.kind === "condition") {
        const branch = r.output === "true" ? "true" : "false";
        decide((o) => !o.error && o.branch === branch);
      } else {
        decide((o) => !o.error);
      }
      return;
    }
    this.finished.set(node.id, { status: "failed", output: null });
    if (node.onError === "continue") {
      // a failed condition continues along its false branch
      decide((o) => !o.error && (node.kind !== "condition" || o.branch === "false"));
    } else if (typeof node.onError === "object") {
      decide((o) => o.error);
    } else {
      this.fatal ??= `${node.id} failed: ${r.error}`;
      decide(() => false);
      this.inner.abort();
    }
  }

  private skip(id: string): void {
    this.state.set(id, "done");
    this.finished.set(id, { status: "skipped", output: null });
    for (const o of this.outgoing.get(id) ?? []) this.edge.set(o.key, "dead");
    const row = this.newNodeRun(id, 1, "skipped");
    this.deps.store.insertNodeRun(row);
    this.nodeChanged(row);
  }

  // ------------------------------------------------------------------ one node

  private async runNode(node: WorkflowNode): Promise<Settled> {
    if (node.kind === "start" || node.kind === "end" || node.kind.startsWith("parallel_")) {
      const row = this.newNodeRun(node.id, 1, "completed");
      this.deps.store.insertNodeRun(row);
      this.nodeChanged(row);
      return { kind: "completed", output: null };
    }
    const max = node.retry.maxAttempts;
    let lastError = "failed";
    for (let attempt = 1; attempt <= max; attempt += 1) {
      if (this.inner.signal.aborted) return { kind: "cancelled" };
      const row = this.newNodeRun(node.id, attempt, "running");
      this.deps.store.insertNodeRun(row);
      this.nodeChanged(row);
      try {
        const { output } = await this.attempt(node, attempt, row);
        this.waitingNodes.delete(node.id);
        if (this.inner.signal.aborted) {
          this.patchNode(row, { status: "cancelled" });
          return { kind: "cancelled" };
        }
        this.patchNode(row, { status: "completed", outputSummary: clip(output) });
        return { kind: "completed", output };
      } catch (err) {
        this.waitingNodes.delete(node.id);
        if (this.inner.signal.aborted) {
          this.patchNode(row, { status: "cancelled" });
          return { kind: "cancelled" };
        }
        lastError = errorText(err);
        this.patchNode(row, { status: "failed", error: clip(lastError) });
      }
      if (attempt < max && node.retry.backoffMs > 0) {
        try {
          await this.sleep(node.retry.backoffMs, this.inner.signal);
        } catch {
          return { kind: "cancelled" };
        }
      }
    }
    return { kind: "failed", error: lastError };
  }

  private attempt(node: WorkflowNode, attempt: number, row: WorkflowNodeRun): Promise<NodeOutcome> {
    if (node.kind === "condition") {
      const expression = (node.config as { expression: string }).expression;
      const scope: Record<string, FinishedNode> = {};
      for (const a of this.ancestors.get(node.id) ?? []) {
        const f = this.finished.get(a);
        if (f) scope[a] = f;
      }
      try {
        const value = compileCondition(expression).evaluate(scope);
        return Promise.resolve({ output: value ? "true" : "false" });
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
    const executor = this.deps.executors[node.kind as ExecutableKind];
    return executor({
      run: this.input.run,
      node,
      attempt,
      prompt: this.input.prompt,
      signal: this.inner.signal,
      setSession: (sessionId) => this.patchNode(row, { sessionId }),
      waiting: () => {
        this.waitingNodes.add(node.id);
        this.patchNode(row, { status: "waiting_for_approval" });
      },
    });
  }

  // ------------------------------------------------------------------ persistence + events

  private newNodeRun(nodeId: string, attempt: number, status: NodeRunStatus): WorkflowNodeRun {
    return {
      id: newId(this.now()),
      runId: this.input.run.id,
      nodeId,
      attempt,
      status,
      sessionId: null,
      outputSummary: null,
      error: null,
    };
  }

  private patchNode(
    row: WorkflowNodeRun,
    patch: Partial<Pick<WorkflowNodeRun, "status" | "sessionId" | "outputSummary" | "error">>,
  ): void {
    Object.assign(row, patch);
    this.deps.store.updateNodeRun(row.id, patch);
    if (patch.status) this.nodeChanged(row);
  }

  private nodeChanged(row: WorkflowNodeRun): void {
    const payload: WorkflowNodeChangedPayload = {
      runId: row.runId,
      nodeId: row.nodeId,
      attempt: row.attempt,
      status: row.status,
    };
    const label = this.nodes.get(row.nodeId)?.label ?? row.nodeId;
    this.deps.events.event({
      type: "workflow.node_changed",
      executionId: this.input.run.executionId,
      sessionId: row.sessionId,
      severity: row.status === "failed" ? "error" : "info",
      summary: `${label}: ${row.status}${row.attempt > 1 ? ` (attempt ${row.attempt})` : ""}${
        row.error && row.status === "failed" ? ` — ${row.error}` : ""
      }`,
      payload,
    });
    this.deps.events.entity("workflowRun", row.runId, { node: { ...row } });
    this.refreshRunStatus();
  }

  /** running ⇄ waiting_for_approval: waiting only while every active node waits. */
  private refreshRunStatus(): void {
    if (this.runStatus !== "running" && this.runStatus !== "waiting_for_approval") return;
    const active = [...this.state.values()].filter((s) => s === "running").length;
    const next =
      this.waitingNodes.size > 0 && this.waitingNodes.size >= active
        ? "waiting_for_approval"
        : "running";
    if (next !== this.runStatus) this.setRun(next);
  }

  private setRun(
    status: RunStatus,
    extra: Partial<Pick<WorkflowRun, "startedAt" | "endedAt">> = {},
  ) {
    this.runStatus = status;
    const patch = { status, ...extra };
    Object.assign(this.input.run, patch);
    this.deps.store.updateRun(this.input.run.id, patch);
    this.deps.events.entity("workflowRun", this.input.run.id, patch);
  }
}
