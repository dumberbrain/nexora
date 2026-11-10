# Contract: Runtime Adapter interface (server-internal)

Every execution engine implements this interface (`apps/server/src/modules/runtime-manager/
runtime-adapter.ts`). The orchestrator only talks to adapters through it; UI controls are derived
from `capabilities()` (FR-016, FR-031). Unsupported calls throw `CapabilityUnsupportedError`
(→ HTTP 422).

```ts
type RuntimeKind = 'agent_sdk' | 'cli_headless' | 'agent_team_pty' | 'external_observed';

interface RuntimeCapabilityProfile {
  runtime: RuntimeKind;
  canStart: boolean; canStop: boolean; canInterrupt: boolean;
  canPause: boolean; canResume: boolean; canRestart: boolean;
  canSendMessage: 'yes' | 'lead_only' | 'no';
  canSetPermissionMode: boolean;
  emitsEvents: EventType[];
  reportsUsage: 'exact' | 'estimate' | 'none';
  notes: string[];
}

interface StartSessionInput {
  executionId: string; taskId?: string;
  cwd: string;                 // validated inside project root / worktree
  prompt: string;
  agents?: Record<string, AgentDefinitionInput>;  // subagents mode
  permissionMode: 'default' | 'acceptEdits' | 'plan';   // bypass only via explicit confirm flag
  allowedTools?: string[]; mcpServers?: string[];
  maxTurns?: number; maxBudgetUsd?: number; model?: string;
  resumeSessionId?: string;
}

interface RuntimeAdapter {
  kind: RuntimeKind;
  detect(): Promise<{ available: boolean; version?: string; reason?: string }>;
  capabilities(): RuntimeCapabilityProfile;
  start(input: StartSessionInput, sink: EventSink, approvals: ApprovalGate): Promise<SessionHandle>;
}

interface SessionHandle {
  sessionId: string;            // Claude session UUID once known
  stop(): Promise<void>;
  interrupt?(): Promise<void>;
  sendMessage?(text: string): Promise<void>;
  setPermissionMode?(mode: string): Promise<void>;
  done: Promise<SessionResult>; // usage only when reported
}

interface ApprovalGate {   // backed by Permission Manager; never auto-approves
  request(req: { sessionId: string; agentId?: string; toolName: string; input: unknown;
                 riskClass: RiskClass }): Promise<'allow' | 'deny'>;
}

interface EventSink { emit(e: RawRuntimeEvent): void } // → Event Manager normaliser
```

## Capability matrix (initial, from research.md)

| Capability | agent_sdk | cli_headless | agent_team_pty | external_observed |
|---|---|---|---|---|
| start | ✔ | ✔ | ✔ | ✘ |
| stop | ✔ close | ✔ SIGTERM | ✔ | ✘ |
| interrupt | ✔ | ✘ | ✔ Ctrl-C (best effort) | ✘ |
| pause | ✘ | ✘ | ✘ | ✘ |
| resume | ✔ resume id | ✔ `--resume` | ✘ | ✘ |
| sendMessage | ✔ streamInput | ✔ stream-json stdin | lead_only (PTY) | ✘ |
| permission approvals | ✔ canUseTool | ✔ `--permission-prompt-tool` via Ubuliera MCP | ✔ PreToolUse hook | observe only |
| usage | estimate | estimate | none | none |

## Hook ingest payload → normalised event (excerpt)

| hook_event_name | UbulieraEvent.type | Joins |
|---|---|---|
| SessionStart | session.started | session_id, cwd — **not delivered to `http` hooks (S1)**; a session is created from the first event of any type for an unknown `session_id` |
| UserPromptSubmit | message.sent (user → main agent) | session_id, prompt_id |
| SessionEnd | session.stopped | session_id |
| SubagentStart / SubagentStop | agent.spawned / agent.completed | agent_id, agent_type; parent = caller of the latest unmatched `PreToolUse(Agent)` (derived); Stop summary = `last_assistant_message` |
| Stop | agent.waiting (main agent idle) | session_id |
| PreToolUse / PostToolUse | tool.invoked / tool.completed | tool_use_id, agent_id? |
| PostToolUse (Write/Edit) | + file.modified (derived) | tool_input.file_path |
| PermissionRequest | permission.requested | tool_name |
| Notification / TeammateIdle | agent.waiting | agent_id? |
| TaskCreated / TaskCompleted | task.created / task.completed | team task id |
| StopFailure / PostToolUseFailure | error | |
