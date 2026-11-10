# Data Model: AI Development Orchestration Platform

Persistence: local SQLite file (`~/.ubuliera/ubuliera.db` by default) via Drizzle ORM. All IDs are
ULIDs (sortable, generated server-side) unless the value comes from Claude Code (session ids are
Claude's UUIDs). All timestamps are ISO-8601 UTC strings stored as `INTEGER` epoch ms.
Every write goes through a zod schema in `packages/contracts` (single source of truth shared by
server, web, and MCP).

## Entity overview

```text
Project 1─* Execution 1─* Task *─* Task (dependencies)
   │            │  └─1─* ApprovalRequest
   │            ├─1─* Session 1─* Agent (self-ref parent/child)
   │            └─0..1 WorkflowRun ─* WorkflowNodeRun
   └─* Integration                      WorkflowDefinition 1─* WorkflowVersion 1─* WorkflowRun
Event *─0..1 {Session, Agent, Task, Execution}      Message *─0..1 Task
AuditEntry (append-only)
```

## Project

| Field | Type | Rules |
|---|---|---|
| id | ULID | PK |
| name | string | 1–120 chars |
| rootPath | string | absolute, normalised, unique; MUST exist; all agent work confined under it |
| detectedStack | json | `{ languages[], frameworks[], packageManager?, testRunners[] }` |
| instructionFiles | json | paths of CLAUDE.md / AGENTS.md found |
| hooksInstalled | boolean | true after user approved Ubuliera hook install |
| createdAt / lastAnalyzedAt | epoch ms | |

## Execution

| Field | Type | Rules |
|---|---|---|
| id | ULID | PK |
| projectId | FK Project | |
| prompt | text | 1–20 000 chars, user's task |
| analysis | json | `TaskAnalysis` (see contracts) — stack, skills, agents, MCP, complexity |
| mode | enum | `multi_session` \| `agent_teams` \| `subagents` \| `workflow` \| `hybrid` |
| strategy | enum | `spec_driven` \| `plan_first` \| `tdd` \| `direct` \| `research_first` |
| config | json | answers to follow-up questions (parallelism, approval policy, maxParallelSessions ≤ 8 (default 4), budgetUsd?, idleTimeoutMs (default 600 000), turnTimeoutMs (default 1 800 000), modelAnalysisConsent: boolean) |
| worktreePath | string | execution-level isolated worktree `<repo>/.ubuliera/worktrees/<execution>/main` (FR-034) |
| status | enum | see state machine below |
| permissionBypass | boolean | default **false**; true only with explicit per-execution confirmation (FR-053) |
| verification | json? | final summary: tasks done/failed, changed files, test results |
| createdAt / startedAt / endedAt | epoch ms | |

**Execution states**: `draft → analyzing → awaiting_mode → configuring → plan_ready →
awaiting_approval → running ⇄ paused* → verifying → completed | failed | cancelled`.
`*paused` only when every active runtime declares `pause` capability.

## Task

| Field | Type | Rules |
|---|---|---|
| id | string | `T-<n>` unique per execution |
| executionId | FK | |
| title | string | 1–200 |
| description | text | |
| assignedAgentRole | string? | e.g. `backend-developer` |
| agentId | FK Agent? | set when assigned |
| mode | enum | mechanism executing this task (Hybrid explains per task) |
| mechanismReason | text? | required when execution.mode = hybrid |
| priority | enum | `p1` \| `p2` \| `p3` |
| status | enum | `pending, queued, planning, running, waiting_for_input, blocked, reviewing, completed, failed, cancelled` |
| board column | derived | Backlog=pending; Todo=queued; In Progress=planning/running/waiting_for_input/blocked; Review=reviewing; Completed; Failed=failed/cancelled |
| ownedPaths | string[] | globs the task may edit; overlap with a parallel task ⇒ conflict |
| riskClass | enum | `normal` \| `destructive` \| `expensive` \| `deploy` \| `architecture` — non-normal requires approval |
| changedFiles | string[] | from file-modified events / git diff |
| testResults | json? | `{ passed, failed, skipped, reportPath? }` |
| attempt / previousAttemptId | int / FK? | retry chain (US3-5) |
| startedAt / completedAt | epoch ms? | |

`TaskDependency(taskId, dependsOnTaskId)` — must form a DAG (cycle ⇒ validation error).

**Task transitions** (others rejected, including invalid board drags):
`pending→queued→planning→running`; `running→waiting_for_input|blocked|reviewing|failed|cancelled`;
`waiting_for_input|blocked→running`; `reviewing→completed|running`; `failed→(retry creates new
attempt)`; any non-terminal → `cancelled`. User drag allowed only between `pending` and `queued`.

## Session

| Field | Type | Rules |
|---|---|---|
| id | string | Claude Code session UUID (from init message / hook payload) |
| executionId | FK? | null for externally started sessions observed via hooks |
| projectId | FK? | resolved from `cwd` |
| runtime | enum | `agent_sdk` \| `cli_headless` \| `agent_team_pty` \| `external_observed` (same as `RuntimeKind` in contracts/runtime-adapter.md) |
| observeOnly | boolean | true for `external_observed`; UI labels "observe-only" |
| cwd / gitBranch / worktreePath? | string | worktreePath always set for Ubuliera-managed sessions |
| model | string? | only when reported |
| status | enum | `starting, running, idle, waiting_for_approval, paused, unresponsive, stopped, failed, unknown` |
| capabilities | json | `RuntimeCapabilityProfile` snapshot |
| pid | int? | only for processes Ubuliera spawned |
| usage | json? | `{ inputTokens, outputTokens, costUsd }` **only** if runtime reported |
| lastActivityAt / startedAt / endedAt | epoch ms | |

`unknown` is set on server restart for sessions that cannot be re-attached (edge case).
`unresponsive` is set when no activity for `idleTimeoutMs`; exceeding `turnTimeoutMs` interrupts
the session where supported and fails the task with reason `timeout`.
`paused` is shown in the UI as "Interrupt & hold" (interrupt now, resume later by session id);
no runtime offers a true pause.

## Agent

| Field | Type | Rules |
|---|---|---|
| id | string | session id for main agent; Claude `agent_id` / tool_use id for subagents; teammate name for teams |
| sessionId | FK | |
| parentAgentId | FK Agent? | parent/child tree |
| kind | enum | `main`, `subagent`, `team_lead`, `teammate`, `workflow_node` |
| name / role / definitionPath? | string | role from agent definition |
| status | enum | `spawning, running, idle, waiting, completed, failed, stopped` |
| currentTaskId | FK? | |
| summary | text? | completion report (user-visible output only, never hidden reasoning) |

## Event

| Field | Type | Rules |
|---|---|---|
| id | ULID | PK; monotonic ⇒ used as replay cursor |
| ts | epoch ms | event time from source, fallback receive time |
| type | enum | `session.started, session.stopped, agent.spawned, agent.completed, task.created, task.assigned, task.started, task.completed, task.failed, tool.invoked, tool.completed, file.modified, permission.requested, permission.decided, agent.waiting, message.sent, workflow.started, workflow.node_changed, workflow.completed, error` |
| source | enum | `hook`, `stream_json`, `agent_sdk`, `team_files`, `coordinator`, `orchestrator`, `git` |
| reliability | enum | `authoritative` (runtime-reported) \| `derived` (inferred, e.g. file diff) \| `best_effort` (file polling) |
| severity | enum | `debug, info, warn, error` |
| executionId / sessionId / agentId / taskId | FK? | |
| summary | string | ≤ 500 chars, redacted |
| payload | json | redacted; size-capped 32 KB (truncated flag) |

Indexes: `(sessionId, id)`, `(executionId, id)`, `(type, ts)`, FTS5 on `summary` for search.
Retention: 30 days default (configurable); `error` + approval events kept with audit.

## Message

`id, executionId?, taskId?, fromAgentId|from='user'|'coordinator', toAgentId|to, type (instruction |
status | question | answer | review_request | result), summary (redacted), ts`. User-visible text only.

## ApprovalRequest

`id, executionId, taskId?, sessionId?, agentId?, action (tool name / operation), riskClass,
details (redacted json), status (pending | approved | rejected | expired_session), decidedBy?,
decidedAt?, createdAt`. No auto-approval; `expired_session` only when the requesting session died.

## WorkflowDefinition / WorkflowVersion / WorkflowRun / WorkflowNodeRun

- **Definition**: `id, name, description, createdAt`.
- **Version**: `id, definitionId, version (int, increments), graph (json: nodes[], edges[]),
  createdAt` — immutable once saved. Node kinds: `agent, skill, mcp_tool, condition, approval,
  parallel_fork, parallel_join, start, end`. Each node: `retry { maxAttempts ≤ 5, backoffMs }`,
  `onError: fail | continue | goto(nodeId)`. Graph validated: single start, reachable end, no
  cycles (v1).
- **Run**: `id, versionId, executionId, status, startedAt, endedAt`.
- **NodeRun**: `id, runId, nodeId, attempt, status, sessionId?, output summary, error?`.

## Integration

`id, projectId?, kind (skill | command | agent_definition | mcp_server | github), name, source
path / scope (user | project | plugin), executable (boolean — skill/command usable as workflow
step), health (ok | degraded | down | unknown), permissionStatus (allowed | ask | denied |
needs_auth), metadata (json, secrets stripped), discoveredAt`.

## RuntimeCapabilityProfile (value object, not a table)

```text
{ runtime, canStart, canStop, canInterrupt, canPause, canResume, canSendMessage,
  canRestart, canSetPermissionMode, emitsEvents: EventType[], reportsUsage: boolean,
  notes: string[] }
```

Controls in UI are enabled solely from this profile (FR-016, FR-031).

## AuditEntry

`id, ts, actor (user | mcp_client:<name> | system), action, targetType, targetId, outcome
(success | denied | failed), details (redacted)` — append-only, no update/delete API.
