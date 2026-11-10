import { type RuntimeCapabilityProfile } from "@ubuliera/contracts";

/**
 * Sessions Ubuliera did not start, seen only through Claude Code `http` hooks
 * (contracts/runtime-adapter.md → external_observed column). Ubuliera cannot control them, so every
 * control is off and the UI shows them as "observe-only".
 */
export const EXTERNAL_OBSERVED_CAPABILITIES: RuntimeCapabilityProfile = {
  runtime: "external_observed",
  canStart: false,
  canStop: false,
  canInterrupt: false,
  canPause: false,
  canResume: false,
  canRestart: false,
  canSendMessage: "no",
  canSetPermissionMode: false,
  emitsEvents: [
    "session.stopped",
    "agent.spawned",
    "agent.completed",
    "agent.waiting",
    "message.sent",
    "tool.invoked",
    "tool.completed",
    "file.modified",
    "permission.requested",
    "permission.decided",
    "task.created",
    "task.completed",
    "error",
  ],
  reportsUsage: "none",
  notes: [
    "Observed through Claude Code hooks: this session was started outside Ubuliera.",
    "Ubuliera cannot stop, interrupt, resume or message observed sessions — use the terminal that runs it.",
    "Claude Code does not deliver SessionStart to http hooks; the session appears with its first event.",
    "Subagent parent links are derived from the latest Agent tool call (reliability: derived).",
    "Token usage and cost are not reported by hooks.",
  ],
};
