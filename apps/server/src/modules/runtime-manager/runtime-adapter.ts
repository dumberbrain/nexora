/**
 * Shared runtime contract (contracts/runtime-adapter.md, research S3). The orchestrator talks to
 * execution engines ONLY through this interface; UI controls derive from `capabilities()`.
 * Owned by the lead — implementations live in ./adapters/*, the test double in
 * tests/fakes/fake-runtime-adapter.ts.
 */
import {
  ERROR_STATUS,
  type RiskClass,
  type RuntimeCapabilityProfile,
  type RuntimeKind,
  type Usage,
} from "@nexora/contracts";

import { type EventInput } from "../event-manager";

/** Thrown when a control is not supported by the runtime (→ HTTP 422 CAPABILITY_UNSUPPORTED). */
export class CapabilityUnsupportedError extends Error {
  override readonly name = "CapabilityUnsupportedError";
  readonly code = "CAPABILITY_UNSUPPORTED" as const;
  readonly status = ERROR_STATUS.CAPABILITY_UNSUPPORTED;
  constructor(
    readonly runtime: RuntimeKind,
    readonly capability: string,
  ) {
    super(`${runtime} does not support ${capability}`);
  }
}

export interface AgentDefinitionInput {
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

/** Everything needed to start one managed Claude Code session. */
export interface StartSessionInput {
  executionId: string;
  taskId: string | null;
  /** registered project root (never written to directly — FR-034) */
  projectRoot: string;
  /** execution- or task-level git worktree; MUST be inside a Nexora worktree */
  cwd: string;
  prompt: string;
  /** globs (relative to cwd) the task may write; empty = whole worktree */
  ownedPaths: string[];
  agents?: Record<string, AgentDefinitionInput>;
  /** `bypassPermissions` is only ever set when the execution confirmed it (FR-053) */
  permissionMode: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  resumeSessionId?: string;
}

/** Normalised events from the runtime; the sink adds ids, redaction and persistence. */
export interface EventSink {
  emit(event: EventInput): void;
}

export type ToolDecision =
  | { decision: "allow" }
  | { decision: "deny"; reason: string }
  /** needs a human — the adapter must route it to the ApprovalGate */
  | { decision: "ask"; riskClass: RiskClass; reason: string };

/**
 * Scope guard (FR-034): consulted for EVERY tool call — from the SDK `hooks.PreToolUse` callback
 * (covers auto-approved tools) and from `canUseTool`. Shell tools (Bash, PowerShell — S3) are
 * never auto-allowed outside the task scope.
 */
export interface ToolGuard {
  check(call: {
    sessionId: string;
    agentId: string | null;
    toolName: string;
    input: Record<string, unknown>;
  }): ToolDecision;
}

/** Human approval; never resolves by timeout (FR-033). */
export interface ApprovalGate {
  request(req: {
    executionId: string;
    taskId: string | null;
    sessionId: string;
    agentId: string | null;
    toolName: string;
    input: unknown;
    riskClass: RiskClass;
    reason: string;
  }): Promise<"allow" | "deny">;
}

export interface RuntimeDeps {
  sink: EventSink;
  guard: ToolGuard;
  approvals: ApprovalGate;
  /** called once the Claude session id is known (system/init) */
  onSessionId?: (sessionId: string, info: { model: string | null; cwd: string }) => void;
}

export type SessionOutcome = "completed" | "failed" | "interrupted" | "stopped";

export interface SessionResult {
  outcome: SessionOutcome;
  sessionId: string | null;
  /** final user-visible text of the turn, if any */
  resultText: string | null;
  /** only when the runtime reported it; costs are client-side estimates (S3) */
  usage: Usage | null;
  error: string | null;
}

export interface SessionHandle {
  readonly kind: RuntimeKind;
  /** resolves when the Claude session id is known */
  readonly sessionId: Promise<string>;
  /** resolves when the current turn ends (result message or process exit) */
  readonly done: Promise<SessionResult>;
  stop(): Promise<void>;
  /** throws CapabilityUnsupportedError when not supported */
  interrupt(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  setPermissionMode(mode: StartSessionInput["permissionMode"]): Promise<void>;
}

export interface RuntimeDetection {
  available: boolean;
  version: string | null;
  reason: string | null;
}

export interface RuntimeAdapter {
  readonly kind: RuntimeKind;
  detect(): Promise<RuntimeDetection>;
  capabilities(): RuntimeCapabilityProfile;
  start(input: StartSessionInput, deps: RuntimeDeps): Promise<SessionHandle>;
}

/** Tools that execute arbitrary shell commands — always routed through the ApprovalGate. */
export const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
/** Tools that write files; their target path is checked against the task scope. */
export const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
