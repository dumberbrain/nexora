# Contract: HTTP API (Hono, `/api/v1`)

Base: `http://127.0.0.1:3022/api/v1`. All bodies JSON, validated by zod schemas exported from
`packages/contracts` (`@nexora/contracts`). Errors use one shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [] } }
```

Codes: `VALIDATION_FAILED 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`,
`CONFLICT 409` (invalid state transition), `CAPABILITY_UNSUPPORTED 422`, `APPROVAL_REQUIRED 428`,
`INTERNAL 500`.

**Auth**: loopback requests from the served web app carry a per-install session cookie
(`HttpOnly; SameSite=Strict`) plus `X-Nexora-CSRF` header. Remote mode (opt-in) and MCP require
`Authorization: Bearer <token>`. Every mutating route records an `AuditEntry`.

Pagination: cursor-based `?cursor=<ULID>&limit=1..200` → `{ items, nextCursor }`.

## Projects & analysis

| Method | Path | Purpose |
|---|---|---|
| GET | `/projects` | list projects |
| POST | `/projects` | `{ rootPath }` → register (path validated, must exist) |
| POST | `/projects/:id/analyze` | refresh stack/instructions/integrations detection |
| POST | `/projects/:id/hooks/install` | install Nexora hooks into project settings (requires explicit confirm flag; diff shown first via `GET .../hooks/preview`) |
| GET | `/projects/:id/hooks/preview` | proposed settings diff |
| DELETE | `/projects/:id/hooks` | remove Nexora hooks |

## Executions

| Method | Path | Purpose |
|---|---|---|
| POST | `/executions` | `{ projectId, prompt }` → `draft`, starts analysis |
| GET | `/executions/:id` | full execution incl. analysis, plan, status |
| GET | `/executions/:id/modes` | `ModeOption[]` `{ mode, available, recommended, reason, unavailableReason?, capabilities }` |
| PUT | `/executions/:id/mode` | `{ mode, strategy }` |
| GET | `/executions/:id/questions` | relevant follow-up `Question[]` with `recommendedDefault` |
| PUT | `/executions/:id/config` | answers |
| POST | `/executions/:id/analysis` | `{ consent, rememberConsentForProject }` model-backed refinement (FR-008) |
| POST | `/executions/:id/plan` | generate plan → `plan_ready` |
| POST | `/executions/:id/approve` | `{ approveRiskyTaskIds: string[], permissionBypass?: false }` → `running` |
| POST | `/executions/:id/stop` | stop all runtimes (≤ 5 s) |
| POST | `/executions/:id/pause` / `resume` | 422 if any runtime lacks capability |
| GET | `/executions/:id/verification` | final summary |

## Tasks

| Method | Path | Purpose |
|---|---|---|
| GET | `/executions/:id/tasks` | list (board) |
| GET | `/tasks` | board across executions: `executionId?, projectId?, limit` → `{ items: Task[] }` |
| PATCH | `/tasks/:id/status` | `{ status: "pending" | "queued" }` user move — only `pending⇄queued`, else 409 |
| POST | `/tasks/:id/cancel` | `{ reason? }` |
| POST | `/tasks/:id/retry` | new attempt linked to previous |
| POST | `/executions/:id/tasks` | assign additional task |
| POST | `/tasks/:id/review` | `{ note? }` request review by reviewer agent |

`/tasks/:id/…` is shorthand: task ids (`T-<n>`) are unique per execution, so the real paths are `/executions/:executionId/tasks/:taskId/{status,cancel,retry,review}`. `POST /executions/:id/tasks` takes `AssignTaskInput`. Each control returns the updated entity.

## Sessions & agents

| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions` | filter `status, executionId, projectId` |
| GET | `/sessions/:id` | incl. capabilities |
| POST | `/sessions/:id/stop` · `/interrupt` · `/restart` · `/resume` | capability-gated (422) |
| POST | `/sessions/:id/messages` | `{ text }` send to session's main agent (capability-gated) |
| GET | `/agents` | filter `sessionId, executionId, status` |
| GET | `/agents/:id` | details incl. timeline cursor, files, usage (nullable) |
| POST | `/agents/:id/messages` | send message (capability-gated) |
| GET | `/messages` | Communication Center: `executionId?, taskId?, type?, limit, cursor` → `{ items: Message[], nextCursor }` |
| GET/PUT | `/projects/:id/model-consent` | `{ alwaysAllow }` per-project model-usage consent; PUT false revokes (FR-008) |

## Approvals

| GET | `/approvals?status=pending` | |
| POST | `/approvals/:id/decision` | `{ decision: "approve" \| "reject", note? }` |

## Events & logs

| GET | `/events` | filters `sessionId, agentId, executionId, type[], mode, severity[], from, to, q, cursor` |
| GET | `/events/export` | same filters, `format=jsonl\|csv`, streamed, redacted |

## Workflows

| GET/POST | `/workflows` | list / create definition |
| GET | `/workflows/:id/versions` | |
| POST | `/workflows/:id/versions` | save new immutable version (graph validated) |
| POST | `/workflows/:id/versions/:v/run` | `{ projectId }` → creates execution (mode `workflow`) |

## Integrations & GitHub

| GET | `/integrations?projectId=` | skills, commands, agents, MCP servers (secrets stripped) |
| GET | `/runtime/environment` | Claude Code version, auth status, Agent Teams support, gh status |
| GET | `/github/status` | `connected \| not_installed \| not_authenticated` + setup hint |
| GET | `/github/repos/:owner/:repo/{branches,commits,pulls}` | via `gh api` (read-only) |
| GET | `/github/repos/:owner/:repo/pulls/:n/files` | changed files + review status |

## Hook ingestion (internal, loopback only)

| POST | `/hooks/ingest` | body = raw Claude Code hook JSON; header `X-Nexora-Hook-Token` (per-project secret written into hook config). Returns hook decision JSON for `PreToolUse`/`PermissionRequest` when the event belongs to a Nexora-managed execution with an approval policy; otherwise `{}` (no effect). |

## Health

| GET | `/health` | `{ status, version, db, uptimeMs }` — no auth, loopback only |
