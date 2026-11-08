import path from "node:path";

import { type EventType, type Severity } from "@nexora/contracts";

import { isInsideRoot } from "../../../lib/path-guard";
import { type EventInput } from "../event-store";
import { type HookPayload, obj, str } from "./hook-payload";

/**
 * Claude Code hook → NexoraEvent normaliser (T057, contracts/runtime-adapter.md table). Pure:
 * source "hook", reliability "authoritative"; PostToolUse of a file-editing tool adds a
 * "derived" file.modified. Payload = the hook body (EventStore redacts and caps it).
 */

/** Tools whose PostToolUse means a file changed, and the input field holding the path. */
const FILE_TOOLS: Record<string, string> = {
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path",
  NotebookEdit: "notebook_path",
};

interface Mapping {
  type: EventType;
  severity: Severity;
  summary: (p: HookPayload) => string;
}

const looksWindows = (p: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(p);

/** Path relative to cwd (forward slashes) when inside it, else unchanged. */
export function displayPath(file: string, cwd: string | undefined): string {
  if (!cwd) return file;
  const win = looksWindows(cwd) || looksWindows(file);
  if (!isInsideRoot(cwd, file, win ? "win32" : "posix")) return file;
  const p = win ? path.win32 : path.posix;
  const rel = p.relative(cwd, file);
  return rel === "" ? file : rel.split(p.sep).join("/");
}

export function toolSummary(p: HookPayload): string {
  const name = str(p, "tool_name") ?? "tool";
  const input = obj(p, "tool_input");
  const field = (key: string) => str(input, key);
  const withPath = (key: string) => {
    const file = field(key);
    return file ? `${name} ${displayPath(file, p.cwd)}` : name;
  };
  const labelled = (key: string) => {
    const value = field(key);
    return value ? `${name}: ${value}` : name;
  };
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
      return withPath("file_path");
    case "NotebookEdit":
      return withPath("notebook_path");
    case "Bash":
      return labelled("command");
    case "Glob":
    case "Grep":
      return labelled("pattern");
    case "WebFetch":
      return labelled("url");
    case "WebSearch":
      return labelled("query");
    case "Agent":
    case "Task": {
      const what = field("description") ?? "subagent";
      const type = field("subagent_type");
      return `Agent: ${what}${type ? ` (${type})` : ""}`;
    }
    default:
      return name;
  }
}

const withDetail = (text: string, detail: string | null) => (detail ? `${text}: ${detail}` : text);

const MAPPINGS: Record<string, Mapping> = {
  UserPromptSubmit: {
    type: "message.sent",
    severity: "info",
    summary: (p) => withDetail("User prompt", str(p, "prompt")),
  },
  PreToolUse: { type: "tool.invoked", severity: "info", summary: toolSummary },
  PostToolUse: { type: "tool.completed", severity: "info", summary: toolSummary },
  PostToolUseFailure: {
    type: "error",
    severity: "error",
    summary: (p) => withDetail(`${toolSummary(p)} failed`, str(p, "error")),
  },
  PermissionRequest: {
    type: "permission.requested",
    severity: "warn",
    summary: (p) => `Permission requested: ${toolSummary(p)}`,
  },
  PermissionDenied: {
    type: "permission.decided",
    severity: "warn",
    summary: (p) => `Permission denied: ${toolSummary(p)}`,
  },
  Notification: {
    type: "agent.waiting",
    severity: "info",
    summary: (p) => withDetail("Notification", str(p, "message")),
  },
  SubagentStart: {
    type: "agent.spawned",
    severity: "info",
    summary: (p) => `Spawned ${str(p, "agent_type") ?? "a"} subagent`,
  },
  SubagentStop: {
    type: "agent.completed",
    severity: "info",
    summary: (p) => `${str(p, "agent_type") ?? "Subagent"} subagent completed`,
  },
  TaskCreated: {
    type: "task.created",
    severity: "info",
    summary: (p) => withDetail("Task created", str(p, "task_subject") ?? str(p, "task_id")),
  },
  TaskCompleted: {
    type: "task.completed",
    severity: "info",
    summary: (p) => withDetail("Task completed", str(p, "task_subject") ?? str(p, "task_id")),
  },
  TeammateIdle: {
    type: "agent.waiting",
    severity: "info",
    summary: (p) => {
      const name = str(p, "teammate_name");
      return name ? `Teammate ${name} is idle` : "Teammate is idle";
    },
  },
  Stop: {
    type: "agent.waiting",
    severity: "info",
    summary: () => "Main agent finished its turn — waiting for input",
  },
  StopFailure: {
    type: "error",
    severity: "error",
    summary: (p) => withDetail("Turn failed", str(p, "error")),
  },
  SessionEnd: {
    type: "session.stopped",
    severity: "info",
    summary: (p) => `Session ended (${str(p, "reason") ?? "unknown"})`,
  },
};

export interface NormalizeContext {
  /** derived parent of a SubagentStart (see AgentTree) */
  parentAgentId?: string | null;
}

/** Events for one hook delivery; empty for hook events without a mapping (e.g. CwdChanged). */
export function normalizeHook(p: HookPayload, ctx: NormalizeContext = {}): EventInput[] {
  const mapping = MAPPINGS[p.hook_event_name];
  if (!mapping) return [];
  const agentId = str(p, "agent_id");
  const common = {
    source: "hook",
    sessionId: p.session_id,
    agentId,
    executionId: null,
    taskId: null,
  } as const;

  const payload =
    p.hook_event_name === "SubagentStart" && ctx.parentAgentId
      ? { ...p, nexora: { parentAgentId: ctx.parentAgentId, parentLinkReliability: "derived" } }
      : p;
  const events: EventInput[] = [
    {
      ...common,
      type: mapping.type,
      reliability: "authoritative",
      severity: mapping.severity,
      summary: mapping.summary(p),
      payload,
    },
  ];

  const toolName = str(p, "tool_name");
  const pathField = toolName ? FILE_TOOLS[toolName] : undefined;
  const file = pathField ? str(obj(p, "tool_input"), pathField) : null;
  if (p.hook_event_name === "PostToolUse" && toolName && file) {
    const shown = displayPath(file, p.cwd);
    events.push({
      ...common,
      type: "file.modified",
      reliability: "derived",
      severity: "info",
      summary: `Modified ${shown}`,
      payload: {
        path: shown,
        absolutePath: file,
        tool: toolName,
        toolUseId: str(p, "tool_use_id"),
      },
    });
  }
  return events;
}
