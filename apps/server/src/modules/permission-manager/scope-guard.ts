import path from "node:path";

import picomatch from "picomatch";

import { type AuditService } from "./audit.service";
import { resolveInsideRootSync } from "../../lib/path-guard";
import { redactString } from "../../lib/redactor";
import {
  FILE_WRITE_TOOLS,
  SHELL_TOOLS,
  type ToolDecision,
  type ToolGuard,
} from "../runtime-manager/runtime-adapter";

export interface ScopeGuardOptions {
  /** the session's worktree — the only place it may write */
  cwd: string;
  /** registered project root — readable, never written to directly */
  projectRoot: string;
  /** globs relative to cwd the task may write; empty = whole worktree */
  ownedPaths: readonly string[];
  audit: Pick<AuditService, "record">;
  executionId: string;
  taskId: string | null;
}

type GuardCall = Parameters<ToolGuard["check"]>[0];

/** Read-only tools and the input field holding their path. */
const READ_TOOLS: Record<string, string> = {
  Read: "file_path",
  Glob: "path",
  Grep: "path",
  LS: "path",
  NotebookRead: "notebook_path",
};

/** Tools that only coordinate work inside the session — their effects are guarded separately. */
const ORCHESTRATION_TOOLS = new Set([
  "Agent",
  "Task",
  "TodoWrite",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "TaskOutput",
  "TaskStop",
  "EnterPlanMode",
  "ExitPlanMode",
  "ToolSearch",
  "Skill",
]);

const MAX_COMMAND_CHARS = 200;
const isWin = process.platform === "win32";

const allow: ToolDecision = { decision: "allow" };

/**
 * Per-session scope guard (FR-034, T094). Consulted for every tool call from both the SDK
 * PreToolUse hook and canUseTool: file writes must stay inside the worktree and the task's owned
 * paths, shell and outward-facing tools always need a human, reads stay inside the project.
 * Every denial is audited.
 */
export class ScopeGuard implements ToolGuard {
  private readonly owned: ((p: string) => boolean) | null;

  constructor(private readonly opts: ScopeGuardOptions) {
    this.owned =
      opts.ownedPaths.length === 0
        ? null
        : picomatch([...opts.ownedPaths], { dot: true, nocase: isWin, windows: false });
  }

  check(call: GuardCall): ToolDecision {
    const { toolName, input } = call;
    if (FILE_WRITE_TOOLS.has(toolName)) return this.checkWrite(call);
    if (SHELL_TOOLS.has(toolName)) {
      const command = typeof input.command === "string" ? input.command : "";
      return { decision: "ask", riskClass: "normal", reason: `Shell command: ${clip(command)}` };
    }
    const readField = READ_TOOLS[toolName];
    if (readField !== undefined) return this.checkRead(call, input[readField]);
    if (ORCHESTRATION_TOOLS.has(toolName)) return allow;
    if (toolName === "WebFetch" || toolName === "WebSearch" || toolName.startsWith("mcp__")) {
      return { decision: "ask", riskClass: "normal", reason: `Outward-facing tool: ${toolName}` };
    }
    return { decision: "ask", riskClass: "normal", reason: `Unknown tool: ${toolName}` };
  }

  private checkWrite(call: GuardCall): ToolDecision {
    const raw = call.input.file_path ?? call.input.notebook_path;
    if (typeof raw !== "string" || raw.length === 0) {
      return this.deny(call, null, `${call.toolName} has no target path`);
    }
    const target = path.resolve(this.opts.cwd, raw);
    let real: string;
    try {
      real = resolveInsideRootSync(this.opts.cwd, target);
    } catch {
      return this.deny(call, raw, `${call.toolName} target is outside the task worktree`);
    }
    if (this.owned) {
      const rel = path.relative(realRoot(this.opts.cwd), real).split(path.sep).join("/");
      if (!this.owned(rel)) {
        return this.deny(
          call,
          raw,
          `${call.toolName} target ${rel} is outside the task's owned paths`,
        );
      }
    }
    return allow;
  }

  private checkRead(call: GuardCall, raw: unknown): ToolDecision {
    if (typeof raw !== "string" || raw.length === 0) return allow;
    const target = path.resolve(this.opts.cwd, raw);
    for (const root of [this.opts.projectRoot, this.opts.cwd]) {
      try {
        resolveInsideRootSync(root, target);
        return allow;
      } catch {
        /* try the next root */
      }
    }
    return this.deny(call, raw, `${call.toolName} target is outside the project`);
  }

  private deny(call: GuardCall, target: string | null, reason: string): ToolDecision {
    this.opts.audit.record({
      actor: "system",
      action: "scope.deny",
      targetType: "session",
      targetId: call.sessionId,
      outcome: "denied",
      details: {
        toolName: call.toolName,
        agentId: call.agentId,
        path: target,
        reason,
        executionId: this.opts.executionId,
        taskId: this.opts.taskId,
      },
    });
    return { decision: "deny", reason };
  }
}

function clip(command: string): string {
  const safe = redactString(command).replace(/\s+/g, " ").trim();
  return safe.length > MAX_COMMAND_CHARS ? `${safe.slice(0, MAX_COMMAND_CHARS - 1)}…` : safe;
}

function realRoot(root: string): string {
  return resolveInsideRootSync(root, root);
}
