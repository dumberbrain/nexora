import { type EventType, type RuntimeCapabilityProfile } from "@nexora/contracts";

/** Events both managed runtimes derive from the SDK / stream-json message stream. */
const MANAGED_EVENTS: EventType[] = [
  "session.started",
  "session.stopped",
  "agent.spawned",
  "agent.completed",
  "agent.waiting",
  "tool.invoked",
  "tool.completed",
  "file.modified",
  "error",
];

/** Agent SDK `query()` in streaming-input mode (research R1, S3). */
export const AGENT_SDK_CAPABILITIES: RuntimeCapabilityProfile = {
  runtime: "agent_sdk",
  canStart: true,
  canStop: true,
  canInterrupt: true,
  canPause: false,
  canResume: true,
  canRestart: true,
  canSendMessage: "yes",
  canSetPermissionMode: true,
  emitsEvents: MANAGED_EVENTS,
  reportsUsage: "estimate",
  notes: [
    "Started and controlled by Nexora through the Claude Agent SDK.",
    "No pause: Interrupt & hold = interrupt + resume.",
    "Token usage and cost come from the runtime; cost is Claude Code's client-side estimate.",
    "Tool calls are checked by the task scope guard; shell commands always need approval.",
  ],
};

/** `claude -p --input-format stream-json --output-format stream-json --verbose` (R1). */
export const CLI_HEADLESS_CAPABILITIES: RuntimeCapabilityProfile = {
  runtime: "cli_headless",
  canStart: true,
  canStop: true,
  canInterrupt: false,
  canPause: false,
  canResume: true,
  canRestart: false,
  canSendMessage: "yes",
  canSetPermissionMode: false,
  emitsEvents: MANAGED_EVENTS,
  reportsUsage: "estimate",
  notes: [
    "Started by Nexora as a headless claude CLI process (stream-json).",
    "No interrupt: the CLI only supports stopping the process; resume continues the session.",
    "The permission mode is fixed for the lifetime of the process.",
    "Token usage and cost come from the runtime; cost is Claude Code's client-side estimate.",
  ],
};

/** Test-only deterministic runtime (NEXORA_TEST_FAKE_RUNTIME=1 with NODE_ENV=test). */
export const FAKE_RUNTIME_CAPABILITIES: RuntimeCapabilityProfile = {
  ...AGENT_SDK_CAPABILITIES,
  notes: ["Test-only simulated runtime (NODE_ENV=test).", ...AGENT_SDK_CAPABILITIES.notes],
};
