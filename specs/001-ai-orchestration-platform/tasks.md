---

description: "Task list for AI Development Orchestration Platform (Nexora)"
---

# Tasks: AI Development Orchestration Platform

**Input**: Design documents from `specs/001-ai-orchestration-platform/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. Constitution Principle V requires test-first for core orchestration logic
(state machines, scheduler, permission checks, event handling, redaction) and integration/contract
tests on every adapter boundary. Test tasks MUST be written and fail before their implementation.

**Organization**: Grouped by user story (US1–US8 from spec.md) so each story is an independently
testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks)
- **[Story]**: US1…US8 (user-story phases only)

## Path Conventions

- Server: `apps/server/src/`, tests `apps/server/tests/{unit,contract,integration,fixtures}/`
- Web (FSD, team-front profile `shadcn-tailwind-tanstack-router`, Rsbuild): `apps/web/src/{app,routes,views,widgets,features,entities,shared}/`
- Shared schemas: `packages/contracts/src/`
- E2E: `e2e/`
- Web rules for every web task: ≤150 lines per `.tsx`, sub-components in a sibling `components/`
  folder, no `useEffect` except syncing an external system (comment which), no `console.log`
  (use `shared/lib/logger`), imports only via slice `index.ts`, a11y labels on all controls,
  loading/empty/error states, real backend data only.
- Visual language for every web task: reactivite.vercel.app terminal/phosphor style — use the
  tokens and utilities in `apps/web/src/app/styles/globals.css` (`text-display`, `text-index`,
  `corner-brackets`, `bg-terminal-grid`, `shadow-glow`, `font-mono` body); see research.md R9.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling, workspaces, prerequisites

- [X] T001 Install and authenticate GitHub CLI on the dev machine: run `winget install --id GitHub.cli -e`, restart the shell, run `gh auth login` (interactive — user runs it via `! gh auth login`), verify with `gh --version` and `gh auth status`; document the steps (incl. macOS `brew install gh`, Linux package) in `docs/setup/prerequisites.md`
- [X] T002 Create root `package.json` with npm workspaces `["apps/*","packages/*"]`, `"engines": {"node": ">=22"}`, scripts `dev`, `build`, `start`, `start:e2e` (production build with `NODE_ENV=test`, `NEXORA_TEST_FAKE_RUNTIME=1`, temporary `NEXORA_DATA_DIR`), `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`; add `.nvmrc` (`22`) and `.npmrc` (`save-exact=true`)
- [X] T003 Create `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2023, bundler resolution) and per-package `tsconfig.json` references
- [X] T004 [P] Scaffold `packages/contracts` (`package.json` name `@nexora/contracts`, deps `zod`, `src/index.ts` barrel, build via `tsc`)
- [X] T005 [P] Scaffold `apps/server` (`package.json` deps: `hono`, `@hono/node-server`, `@hono/zod-validator`, `socket.io`, `drizzle-orm`, `better-sqlite3`, `ulid`, `pino`, `picomatch`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`; dev: `drizzle-kit`, `tsx`, `vitest`, `@types/better-sqlite3`), `apps/server/drizzle.config.ts`
- [X] T006 [P] Scaffold `apps/web` with Rsbuild: `apps/web/rsbuild.config.ts` (`@rsbuild/plugin-react`, `TanStackRouterRspack({ target: 'react', autoCodeSplitting: true })` from `@tanstack/router-plugin/rspack` in `tools.rspack.plugins`, `server.port: 3022`, `server.proxy` for `/api` and `/mcp` → `http://127.0.0.1:3023` and `/socket.io` with `ws: true`, alias `@` → `src`, `source.define` only for `PUBLIC_*`), `apps/web/postcss.config.mjs` (`@tailwindcss/postcss`), `apps/web/index.html`, `apps/web/src/app/main.tsx`
- [X] T007 [P] Add web deps to `apps/web/package.json`: `react@19`, `react-dom@19`, `@tanstack/react-router`, `@tanstack/react-query`, `zustand`, `axios`, `socket.io-client`, `@xyflow/react`, `@dnd-kit/core`, `@dnd-kit/sortable`, `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`, `@xterm/xterm`, `class-variance-authority`, `tailwind-merge`, `lucide-react`; dev: `@tanstack/router-devtools`, `@testing-library/react`, `@testing-library/user-event`, `msw`, `jsdom`
- [X] T008 [P] Configure ESLint flat config `eslint.config.js` (typescript-eslint strict, react-hooks, `@tanstack/eslint-plugin-query`, `@tanstack/eslint-plugin-router`, `max-lines: 150` for `apps/web/**/*.tsx` skipping blank/comments, `no-console: error`, FSD import-boundary rule) and Prettier `.prettierrc.json` + `.prettierignore`
- [X] T009 [P] Configure git hooks with the user's `husky-set` layout (user decision, replaces lint-staged + commitlint): `.husky/lib.sh`, `.husky/pre-commit` (branch gate incl. spec-kit `NNN-name`, staged lint + prettier --check), `.husky/commit-msg` (Conventional Commits prefixes incl. build/style), `.husky/pre-push` (lint, typecheck); `check` / `check:staged` scripts
- [X] T010 [P] Configure Vitest 5 projects in root `vitest.config.ts` (projects: `packages/contracts` node, `apps/server` node, `apps/web` jsdom with setup `apps/web/tests/setup.ts` starting MSW server from `apps/web/tests/msw/server.ts`); exclude `e2e/**`
- [X] T011 [P] Configure Playwright `playwright.config.ts` (`webServer`: `npm run build && npm run start:e2e`, `baseURL: http://localhost:3022`, chromium+firefox+webkit) and `e2e/fixtures/axe.ts` using `@axe-core/playwright`
- [X] T012 [P] Initialise shadcn/ui: `apps/web/components.json`, primitives in `apps/web/src/shared/ui/` (button, card, badge, dialog, sheet, tabs, table, tooltip, dropdown-menu, input, textarea, select, checkbox, scroll-area, separator, skeleton, sonner), `cn` helper `apps/web/src/shared/lib/cn.ts`, design tokens (dark default + light) in `apps/web/src/app/styles/globals.css`
- [X] T013 [P] Add CI workflow `.github/workflows/ci.yml` (node 22, `npm ci`, lint, typecheck, test, build, Playwright E2E, upload report)
- [X] T014 [P] Add PR template `.github/pull_request_template.md` with a checklist stating compliance with constitution Principles I–V, security constraints, tests run, and documented limitations
- [X] T015 [P] Extend `.gitignore` with `node_modules/`, `dist/`, `.nexora/`, `*.db`, `*.db-wal`, `*.db-shm`, `playwright-report/`, `test-results/`, `apps/web/src/routeTree.gen.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contracts, persistence, server/web skeleton, security baseline, event core

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Contracts (single source of truth)

- [X] T016 [P] Define enums in `packages/contracts/src/enums.ts`: ExecutionMode (`multi_session|agent_teams|subagents|workflow|hybrid`), Strategy (`spec_driven|plan_first|tdd|direct|research_first`), ExecutionStatus (`draft, analyzing, awaiting_mode, configuring, plan_ready, awaiting_approval, running, paused, verifying, completed, failed, cancelled`), TaskStatus (`pending, queued, planning, running, waiting_for_input, blocked, reviewing, completed, failed, cancelled`), SessionStatus (`starting, running, idle, waiting_for_approval, paused, unresponsive, stopped, failed, unknown`), AgentKind (`main, subagent, team_lead, teammate, workflow_node`), AgentStatus, EventType (20 types from data-model Event), EventSource (`hook, stream_json, agent_sdk, team_files, coordinator, orchestrator, git`), Reliability (`authoritative|derived|best_effort`), Severity, RiskClass (`normal|destructive|expensive|deploy|architecture`), ApprovalStatus (`pending|approved|rejected|expired_session`), RuntimeKind (`agent_sdk|cli_headless|agent_team_pty|external_observed`)
- [X] T017 [P] Define entity schemas in `packages/contracts/src/entities/` (one file each: project, execution, task, session, agent, event, message, approval, workflow, integration, audit, capability) with verbatim constraints: Project.name "1–120 chars", rootPath "absolute, normalised"; Execution.prompt "1–20 000 chars", config.maxParallelSessions "≤ 8 (default 4)", config.idleTimeoutMs "default 600 000", config.turnTimeoutMs "default 1 800 000", config.modelAnalysisConsent boolean, worktreePath, permissionBypass "default false"; Session.observeOnly boolean; Task.title "1–200", priority `p1|p2|p3`, id `T-<n>`; Event.summary "≤ 500 chars", payload "size-capped 32 KB (truncated flag)"; Message summary redacted; Workflow node retry "maxAttempts ≤ 5, backoffMs", onError `fail|continue|goto(nodeId)`; RuntimeCapabilityProfile per `contracts/runtime-adapter.md`
- [X] T018 [P] Define API error shape and codes (`VALIDATION_FAILED 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, CAPABILITY_UNSUPPORTED 422, APPROVAL_REQUIRED 428, INTERNAL 500`) and cursor pagination schema (`limit 1..200`) in `packages/contracts/src/api/common.ts`
- [X] T019 [P] Define Socket.IO schemas (`subscribe`, `unsubscribe`, `event`, `entity.changed`, `stats`, `replay.done`) in `packages/contracts/src/socket.ts` per `contracts/socket-events.md`
- [X] T020 Write schema tests in `packages/contracts/tests/schemas.test.ts` (boundary values for every quoted constraint)

### Server core (tests first)

- [X] T021 [P] Write failing tests `apps/server/tests/unit/config/env.test.ts`: defaults host `127.0.0.1`, port 3022 (prod) / 3023 (dev); non-loopback host rejected unless `NEXORA_REMOTE=1` AND `NEXORA_TOKEN` (≥32 chars) set
- [X] T022 Implement env config in `apps/server/src/config/env.ts` (zod) to pass T021
- [X] T023 [P] Write failing tests `apps/server/tests/unit/lib/redactor.test.ts` (Anthropic/OpenAI/GitHub/AWS keys, bearer headers, `password=`, PEM private keys, high-entropy strings in `.env` lines; nested JSON; idempotent)
- [X] T024 Implement redactor in `apps/server/src/lib/redactor.ts` to pass T023
- [X] T025 [P] Write failing tests `apps/server/tests/unit/lib/path-guard.test.ts` (traversal `..`, symlink escape, Windows drive/UNC paths, case-insensitive roots on win32)
- [X] T026 Implement path guard in `apps/server/src/lib/path-guard.ts` to pass T025
- [X] T027 [P] Write failing tests `apps/server/tests/unit/lib/process.test.ts`: only `claude`, `git`, `gh` allowed; args passed as array; no shell; timeout + kill tree
- [X] T028 Implement allowlisted process runner in `apps/server/src/lib/process.ts` (`execFile`/`spawn` with `shell:false`) to pass T027
- [X] T029 [P] Implement `apps/server/src/lib/ulid.ts` (monotonic) and `apps/server/src/lib/logger.ts` (pino, redactor applied to all log objects)
- [X] T030 Implement Drizzle schema for all tables in `apps/server/src/db/schema.ts` (projects, executions, tasks, task_dependencies, sessions, agents, events, messages, approval_requests, workflow_definitions, workflow_versions, workflow_runs, workflow_node_runs, integrations, audit_entries, api_tokens) with indexes `(session_id,id)`, `(execution_id,id)`, `(type,ts)`; generate migration in `apps/server/drizzle/`; add raw-SQL migration for FTS5 virtual table `events_fts(summary)`
- [X] T031 Implement DB client `apps/server/src/db/client.ts` (data dir `NEXORA_DATA_DIR` default `~/.nexora`, WAL, foreign keys on, migrate on start) and `db:migrate` script `apps/server/src/db/migrate.ts`
- [X] T032 [P] Write failing tests `apps/server/tests/integration/http/security.test.ts` via `app.request()`: rejects foreign `Origin`/`Host` (DNS rebinding), mutating request without CSRF header → 403, bearer token required in remote mode, secure headers present
- [X] T033 Implement Hono app `apps/server/src/http/app.ts` with middleware `apps/server/src/http/middleware/{origin-guard,session-cookie,csrf,bearer-auth,error-mapper}.ts` (cookie `HttpOnly; SameSite=Strict`, header `X-Nexora-CSRF`) and `GET /api/v1/health` → `{status, version, db, uptimeMs}` to pass T032
- [X] T034 [P] Implement audit service (append-only, no update/delete) in `apps/server/src/modules/permission-manager/audit.service.ts` + test `apps/server/tests/unit/permission-manager/audit.test.ts`
- [X] T035 [P] Write failing tests `apps/server/tests/unit/event-manager/event-store.test.ts`: 100 ms batched inserts, redaction before insert, payload > 32 KB truncated with flag, summary ≤ 500, cursor query by ULID ordered, filters (session, agent, execution, type[], severity[], from/to, FTS `q`)
- [X] T036 Implement event store + bus in `apps/server/src/modules/event-manager/{event-store.ts,event-bus.ts,index.ts}` to pass T035
- [X] T037 [P] Write failing tests `apps/server/tests/integration/realtime/replay.test.ts`: subscribe with `sinceEventId` replays in order, max 5 000 then `gap: true`, then `replay.done`, then live; per-room 100 ms batching
- [X] T038 Implement Socket.IO gateway `apps/server/src/realtime/gateway.ts` (namespace `/live`, cookie/token handshake auth, rooms `global|execution:<id>|session:<id>|agent:<id>`, replay, batching, `entity.changed` emitter) to pass T037
- [X] T039 Implement bootstrap `apps/server/src/main.ts` (config → db → modules → Hono via `@hono/node-server` + Socket.IO on same `http.Server`; in production serve `apps/web/dist` with SPA fallback on port 3022; graceful shutdown stops runtimes)

### Web core

- [X] T040 [P] Implement `apps/web/src/shared/api/http.ts` (axios instance, base `/api/v1`, `withCredentials`, `X-Nexora-CSRF` header from cookie/meta, maps error shape to typed `ApiError`) + test `apps/web/src/shared/api/http.test.ts`
- [X] T041 [P] Implement `apps/web/src/shared/api/query-client.ts` (staleTime defaults per team standard, retry off for 4xx)
- [X] T042 [P] Implement `apps/web/src/shared/lib/{logger.ts,create-resettable-store.ts}` and `apps/web/src/shared/config/env.ts` (`PUBLIC_*` only)
- [X] T043 Implement socket client `apps/web/src/shared/socket/{client.ts,use-live-subscription.ts}` (singleton `socket.io-client`, stores `lastEventId` per subscription, re-subscribes with `sinceEventId` on reconnect, dedupes by id; `useEffect` allowed — external system: socket) + test `apps/web/src/shared/socket/use-live-subscription.test.ts`
- [X] T044 Implement `apps/web/src/app/socket-bridge.ts` applying `entity.changed` to TanStack Query cache via `setQueryData`/exact-key invalidation
- [X] T045 Implement app shell: `apps/web/src/app/{providers.tsx,router.tsx}`, `apps/web/src/routes/__root.tsx`, widget `apps/web/src/widgets/app-shell/` (sidebar nav: Overview, Agent Canvas, Sessions, Tasks, Workflows, Communication, Live Logs, Skills & MCP, GitHub; header with connection status indicator + theme toggle; responsive collapse)
- [X] T046 [P] Implement feature `apps/web/src/features/toggle-theme/` (dark default, light, system; persisted in localStorage with try/catch)
- [X] T047 [P] Implement shared state components `apps/web/src/shared/ui/state/{loading-state,empty-state,error-state,unavailable-badge}.tsx` (`unavailable-badge` shows "not available" + reason tooltip, used for FR-029/FR-031)
- [X] T048 [P] Implement `apps/web/src/entities/status/` status badge with visually distinct, labelled variants (cva) for Paused, Waiting for approval, Idle, Running, Stopped, Failed, Completed, Unknown (FR-032)

**Checkpoint**: `npm run dev` serves shell on http://localhost:3022, `/api/v1/health` ok, sockets connect

---

## Phase 3: User Story 1 - Watch real agent activity live (Priority: P1) 🎯 MVP

**Goal**: Observe real Claude Code sessions, agents, tools, files and errors live via hooks

**Independent Test**: quickstart V1 + V2 — register sample repo, install hooks, run `claude` with a subagent writing a file; dashboard shows session ≤ 2 s, main→subagent edge, file change; 60 s disconnect replays without loss/duplication

### Tests for User Story 1 ⚠️ (write first, must fail)

- [ ] T049 [US1] Spike S1: in a scratch repo configure an `http` hook to a local echo server for every event in research R2, run a session with a subagent and a Write, save raw payloads to `apps/server/tests/fixtures/hooks/*.json` (redact secrets), and record whether `http` hooks support custom headers in `specs/001-ai-orchestration-platform/research.md` (S1 result)
- [ ] T050 [P] [US1] Contract test `apps/server/tests/contract/hook-ingest.test.ts`: each fixture maps per the table in `contracts/runtime-adapter.md` (SessionStart→session.started … StopFailure→error), PostToolUse Write/Edit adds derived `file.modified`, missing/invalid `X-Nexora-Hook-Token` → 401, response `{}` for observed sessions
- [ ] T051 [P] [US1] Unit test `apps/server/tests/unit/session-manager/session-projection.test.ts`: session status transitions from events, `lastActivityAt`, unknown project resolved by `cwd` under registered root
- [ ] T052 [P] [US1] Unit test `apps/server/tests/unit/agent-registry/agent-tree.test.ts`: SubagentStart/Stop `agent_id`/`agent_type` build parent/child tree under session main agent
- [ ] T053 [P] [US1] Unit test `apps/server/tests/unit/project-registry/hook-installer.test.ts`: preview produces diff of `.claude/settings.local.json` merging (never removing) existing hooks; install requires `confirm: true`; uninstall removes only Nexora entries
- [ ] T054 [P] [US1] E2E `e2e/us1-live-monitoring.spec.ts`: POST recorded fixtures to ingest endpoint, assert Overview counters, Sessions row, canvas nodes/edge, agent details timeline/files, logs filter + export, axe clean

### Implementation for User Story 1

- [ ] T055 [P] [US1] Implement project registry `apps/server/src/modules/project-registry/{project.repository.ts,project.service.ts}` (register `rootPath` must exist, normalised, unique; name 1–120) and routes `apps/server/src/http/routes/projects.ts` (`GET/POST /projects`)
- [ ] T056 [US1] Implement hook installer `apps/server/src/modules/project-registry/hook-installer.ts` (per-project secret, `http` hook entries for R2 events to `${NEXORA_PUBLIC_URL}/api/v1/hooks/ingest` — `NEXORA_PUBLIC_URL` from env config, default `http://127.0.0.1:3022`, header or query-token per S1 result) and routes `GET /projects/:id/hooks/preview`, `POST /projects/:id/hooks/install`, `DELETE /projects/:id/hooks` with audit entries
- [ ] T057 [US1] Implement hook normaliser `apps/server/src/modules/event-manager/normalizers/hook-normalizer.ts` (source `hook`, reliability `authoritative`; derived `file.modified` reliability `derived`) and ingest route `apps/server/src/http/routes/hooks.ts` (loopback only, token check)
- [ ] T058 [US1] Implement session manager projection `apps/server/src/modules/session-manager/{session.repository.ts,session-projection.ts,index.ts}` incl. git branch lookup via `git rev-parse --abbrev-ref HEAD` (process runner) and `entity.changed` emits
- [ ] T059 [US1] Implement agent registry `apps/server/src/modules/agent-registry/{agent.repository.ts,agent-tree.ts,index.ts}`
- [ ] T060 [US1] Implement stats service `apps/server/src/modules/event-manager/stats.service.ts` (active sessions, active/idle agents, completed/failed tasks, pending approvals, running workflows, current mode; socket `stats` throttled ≤ 2/s)
- [ ] T061 [US1] Implement read routes `apps/server/src/http/routes/{sessions.ts,agents.ts,events.ts}`: `GET /sessions`, `GET /sessions/:id` (with capabilities), `GET /agents`, `GET /agents/:id`, `GET /events` (filters + cursor), `GET /events/export?format=jsonl|csv` (streamed, redacted)
- [ ] T062 [P] [US1] Implement entities `apps/web/src/entities/{project,session,agent,event}/` (api functions via `shared/api/http`, query key factories, query options, `model/types.ts` re-exporting contracts, small UI atoms)
- [ ] T063 [P] [US1] Implement feature `apps/web/src/features/register-project/` (RHF + zod form for `rootPath`)
- [ ] T064 [P] [US1] Implement feature `apps/web/src/features/install-hooks/` (dialog showing settings diff, explicit confirm button, uninstall)
- [ ] T065 [P] [US1] Implement widget `apps/web/src/widgets/overview-stats/` (8 stat cards from `stats` socket + initial REST) and view `apps/web/src/views/overview/`, route `apps/web/src/routes/index.tsx` (loader `ensureQueryData`)
- [ ] T066 [P] [US1] Implement widget `apps/web/src/widgets/session-table/` ("observe-only" badge for `external_observed` sessions, Session ID, working directory, mode, model or "not available", current task, status badge, last activity relative time, git branch; staleness indicator) and routes `apps/web/src/routes/sessions/index.tsx`, `apps/web/src/routes/sessions/$sessionId.tsx` with view `apps/web/src/views/session/`
- [ ] T067 [US1] Implement widget `apps/web/src/widgets/agent-canvas/` using `@xyflow/react` (custom `AgentNode` in `components/agent-node.tsx` showing name, type, current task, status; parent/child + communication + dependency edge types; edges animate for 1.5 s on related events; auto-layout; click opens details) and route `apps/web/src/routes/canvas.tsx`
- [ ] T068 [US1] Implement widget `apps/web/src/widgets/agent-details-panel/` (Sheet: identity/role, assignment, status, activity timeline with event source + reliability tags, tool events, files changed, task history, output summaries, errors, token usage/cost only when reported else `unavailable-badge`) and route `apps/web/src/routes/agents/$agentId.tsx`
- [ ] T069 [US1] Implement widget `apps/web/src/widgets/log-viewer/` (virtualised list, live append, filters session/agent/type/mode/time/severity bound to URL via `validateSearch` zod, text search) + feature `apps/web/src/features/export-events/`; route `apps/web/src/routes/logs.tsx`
- [ ] T070 [US1] Add MSW handlers `apps/web/tests/msw/handlers/{sessions,agents,events,projects}.ts` and component tests next to widgets (`*.test.tsx`) for overview-stats, session-table, agent-canvas node render, agent-details unavailable usage, log-viewer filters

**Checkpoint**: US1 fully functional — MVP demo of live monitoring with real Claude Code sessions

---

## Phase 4: User Story 2 - Submit a task and launch an approved execution plan (Priority: P1)

**Goal**: Natural-language task → analysis → mode recommendation → relevant questions → plan → approval → running Multi-Session or Subagents execution → verification

**Independent Test**: quickstart V3 + V4 — analysis shows stack/instructions/skills/agents/MCP; Agent Teams disabled with reason when flag unset; plan has IDs, deps, owners, conflicts; destructive task waits for approval; approved run shows status transitions and final verification

### Tests for User Story 2 ⚠️

- [ ] T071 [US2] Spike S3: script `apps/server/scripts/spike-sdk.ts` running SDK `query()` in streaming-input mode against a scratch repo: send message via `streamInput`, `interrupt()`, then new query with `resume: sessionId`; record message fixtures to `apps/server/tests/fixtures/sdk/*.jsonl` and results in research.md (S3)
- [ ] T072 [P] [US2] Unit test `apps/server/tests/unit/execution-orchestrator/execution-state.test.ts`: all allowed transitions `draft → analyzing → awaiting_mode → configuring → plan_ready → awaiting_approval → running ⇄ paused → verifying → completed|failed|cancelled`; invalid ones throw CONFLICT
- [ ] T073 [P] [US2] Unit test `apps/server/tests/unit/task-manager/task-state.test.ts`: transitions per data-model "Task transitions"; dependency graph must be a DAG (cycle ⇒ validation error)
- [ ] T074 [P] [US2] Unit test `apps/server/tests/unit/execution-orchestrator/conflict-detector.test.ts`: overlapping `ownedPaths` globs between parallel tasks flagged (picomatch), non-overlapping not flagged
- [ ] T075 [P] [US2] Unit test `apps/server/tests/unit/execution-orchestrator/scheduler.test.ts`: respects dependencies, `maxParallelSessions` default 4 (≤ 8), conflicting tasks serialised or assigned separate worktrees, risky tasks (`riskClass` ≠ normal) not started without approval
- [ ] T076 [P] [US2] Unit test `apps/server/tests/unit/execution-orchestrator/mode-advisor.test.ts`: unavailable modes carry `unavailableReason` (Agent Teams without `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), recommendation + reason by complexity/parallelism
- [ ] T077 [P] [US2] Unit test `apps/server/tests/unit/permission-manager/approval-gate.test.ts`: request stays pending forever (no timeout auto-approve), approve/reject resolve, session death → `expired_session`, every decision audited
- [ ] T078 [P] [US2] Unit test `apps/server/tests/unit/permission-manager/scope-guard.test.ts`: Write/Edit/MultiEdit/NotebookEdit targeting paths outside the session worktree root or the task's `ownedPaths` → deny + audit entry; reads inside the project allowed; Bash routed to ApprovalGate (not auto-allowed); applies to both PreToolUse hook and `canUseTool` paths
- [ ] T079 [P] [US2] Unit test `apps/server/tests/unit/session-manager/liveness.test.ts`: no activity for `idleTimeoutMs` (default 600 000) → status `unresponsive` + `error` event; exceeding `turnTimeoutMs` (default 1 800 000) → interrupt where capability allows, task `failed` with reason `timeout`; values read from execution config
- [ ] T080 [P] [US2] Unit test `apps/server/tests/unit/execution-orchestrator/analysis-consent.test.ts`: default analysis performs only local inspection (no runtime started); model-backed analysis/planning refused with APPROVAL_REQUIRED until `modelAnalysisConsent` is true or a per-project always-allow preference exists (FR-008)
- [ ] T081 [P] [US2] Contract test `apps/server/tests/contract/agent-sdk-adapter.test.ts` replaying S3 fixtures: `system:init` → session.started with model, `parent_tool_use_id` → subagent agent tree, `result` → usage with `reportsUsage: 'estimate'`, `canUseTool` routed to ApprovalGate
- [ ] T082 [P] [US2] Integration test `apps/server/tests/integration/executions-flow.test.ts` with `FakeRuntimeAdapter` (`apps/server/tests/fakes/fake-runtime-adapter.ts`, test-only): POST /executions → modes → mode → questions → config → plan → approve → tasks run → verification
- [ ] T083 [P] [US2] E2E `e2e/us2-task-to-execution.spec.ts` (served by `start:e2e`; fake adapter enabled via `NEXORA_TEST_FAKE_RUNTIME=1` only when `NODE_ENV=test` — server refuses to start with the flag in any other environment): wizard flow, risky task approval checkbox, status board updates, axe clean

### Implementation for User Story 2

- [ ] T084 [US2] Implement runtime interface + capability profiles `apps/server/src/modules/runtime-manager/{runtime-adapter.ts,capabilities.ts,errors.ts}` per `contracts/runtime-adapter.md` (CapabilityUnsupportedError → 422)
- [ ] T085 [US2] Implement Agent SDK adapter `apps/server/src/modules/runtime-manager/adapters/agent-sdk/{agent-sdk.adapter.ts,message-mapper.ts}` (streaming input, `cwd` validated by path guard, `permissionMode` default `default`, `agents`, `allowedTools`, `maxTurns`, `maxBudgetUsd`, `resume`; `canUseTool` → ApprovalGate; `close`, `interrupt`, `streamInput`, `setPermissionMode`) to pass T081
- [ ] T086 [P] [US2] Implement CLI headless adapter `apps/server/src/modules/runtime-manager/adapters/cli-headless/cli-headless.adapter.ts` (`claude -p --input-format stream-json --output-format stream-json --verbose`, stdin messages, SIGTERM stop, `--resume`) sharing `message-mapper.ts`
- [ ] T087 [US2] Implement runtime manager `apps/server/src/modules/runtime-manager/runtime-manager.ts` (`detect()`: `claude --version`, auth check, Agent Teams env flag in process env + user/project settings `env`; registry of adapters) and route `GET /runtime/environment` in `apps/server/src/http/routes/runtime.ts`
- [ ] T088 [P] [US2] Implement skill/agent/MCP discovery `apps/server/src/modules/skill-registry/discovery.ts` (project `.claude/skills`, `.claude/commands`, `.claude/agents`, user `~/.claude/{skills,agents}`, enabled plugins; `executable` = user-invocable) and `apps/server/src/modules/mcp-registry/discovery.ts` (`.mcp.json`, user config; secrets stripped via redactor)
- [ ] T089 [US2] Implement analysis service `apps/server/src/modules/execution-orchestrator/analysis/analysis.service.ts` (default = local heuristic: stack detection from manifests/lockfiles, CLAUDE.md/AGENTS.md, discovery results, heuristic complexity; optional model-backed refinement via read-only SDK query `permissionMode: 'plan'` returning zod-validated `TaskAnalysis` JSON, only with consent per FR-008) to pass T080
- [ ] T090 [US2] Implement mode advisor + question service `apps/server/src/modules/execution-orchestrator/{mode-advisor.ts,questions.ts}` (only relevant questions, each with `recommendedDefault`) to pass T076
- [ ] T091 [US2] Implement planner `apps/server/src/modules/execution-orchestrator/planner/{planner.ts,conflict-detector.ts}` (consent-gated per FR-008; read-only SDK query in the execution worktree producing tasks with ID `T-<n>`, title 1–200, owner role, deps, priority, `ownedPaths`, `riskClass`; DAG validation; conflicts) to pass T073, T074
- [ ] T092 [US2] Implement git workspace module `apps/server/src/modules/git-workspace/{worktree.service.ts,diff.service.ts}` (every managed execution gets an execution-level worktree `git worktree add <repo>/.nexora/worktrees/<execution>/main -b nexora/<execution>` stored in `Execution.worktreePath`; parallel conflicting tasks additionally get `<repo>/.nexora/worktrees/<execution>/<task>` on `nexora/<execution>/<task>`; add `.nexora/` to the target repo's `.git/info/exclude`; cleanup, changed files via `git diff --name-only`; never force-push)
- [ ] T093 [US2] Implement approval gate + approvals routes `apps/server/src/modules/permission-manager/approval.service.ts`, `apps/server/src/http/routes/approvals.ts` (`GET /approvals?status=pending`, `POST /approvals/:id/decision`) to pass T077
- [ ] T094 [US2] Implement scope guard `apps/server/src/modules/permission-manager/scope-guard.ts` and wire it into the Agent SDK adapter both as SDK `hooks.PreToolUse` (covers auto-approved tools, which skip `canUseTool`) and inside `canUseTool`; CLI headless adapter enforces via `--permission-prompt-tool` + PreToolUse hook; to pass T078
- [ ] T095 [US2] Implement task manager `apps/server/src/modules/task-manager/{task.repository.ts,task-state.ts,task.service.ts}` (statuses, attempts, changedFiles, testResults) to pass T073
- [ ] T096 [US2] Implement liveness monitor `apps/server/src/modules/session-manager/liveness-monitor.ts` (timer per managed session reset on every event; idle → `unresponsive`; turn timeout → `interrupt()` if capability, else stop; marks task failed `timeout`) to pass T079
- [ ] T097 [US2] Implement orchestrator `apps/server/src/modules/execution-orchestrator/{execution-state.ts,orchestrator.ts,scheduler.ts}` (state machine, scheduler with deps/parallelism/worktrees/risk gating, emits task/execution events) to pass T072, T075
- [ ] T098 [US2] Unit test `apps/server/tests/unit/communication-manager/communication.test.ts`: send to session/agent only via adapter `sendMessage` when capability allows (else CAPABILITY_UNSUPPORTED), Message row + `message.sent` event recorded, summary redacted and ≤ 500 chars
- [ ] T099 [US2] Implement communication manager `apps/server/src/modules/communication-manager/{communication.service.ts,message.repository.ts}` (send to session/agent via adapter `sendMessage`, record Message + `message.sent` event, summaries redacted, user-visible text only) to pass T098
- [ ] T100 [US2] Implement mode executors `apps/server/src/modules/execution-orchestrator/modes/{multi-session.ts,subagents.ts}` (every session `cwd` = execution worktree or task worktree, never the project root; multi-session: one SDK session per task, coordinator messaging via Communication Manager; subagents: one SDK session in the execution worktree with 8 role definitions from `apps/server/src/modules/execution-orchestrator/agents/roles.ts` — Architect, Frontend Developer, Backend Developer, Database Engineer, QA Engineer, Security Reviewer, Code Reviewer, DevOps Engineer — plus discovered project agents; main agent review/integration step)
- [ ] T101 [US2] Implement verifier `apps/server/src/modules/execution-orchestrator/verifier.ts` (collect completed/failed tasks, changed files, run detected test command in project via allowlisted runner only if user approved in config, parse pass/fail counts)
- [ ] T102 [US2] Implement executions routes `apps/server/src/http/routes/executions.ts` (`POST /executions`, `GET /executions/:id`, `GET/PUT …/modes|mode`, `GET …/questions`, `PUT …/config`, `POST …/plan`, `POST …/approve` with `permissionBypass` requiring typed confirmation string, `GET …/verification`, `GET …/tasks`) and wire into Hono app
- [ ] T103 [P] [US2] Implement entities `apps/web/src/entities/{execution,task,approval}/` (api, key factories, types)
- [ ] T104 [P] [US2] Implement feature `apps/web/src/features/submit-task/` (project select + prompt textarea 1–20 000 chars, RHF + zod; consent dialog before model-backed analysis/planning stating it consumes model usage, with per-project "always allow" toggle that can be revoked — FR-008) and analysis summary widget `apps/web/src/widgets/analysis-summary/`
- [ ] T105 [P] [US2] Implement feature `apps/web/src/features/choose-mode/` (mode cards: available/recommended badge/reason; unavailable disabled with reason + how to enable)
- [ ] T106 [P] [US2] Implement feature `apps/web/src/features/answer-questions/` (dynamic RHF form from Question[] with defaults; strategy, agent config, skills, MCP, parallelism, approval checkpoints)
- [ ] T107 [US2] Implement feature `apps/web/src/features/approve-plan/` (plan table: ID, title, description, agent, mode, deps, priority, status; conflict highlights; checkbox per risky task; permission-bypass toggle off by default requiring typed confirmation)
- [ ] T108 [US2] Implement views/routes `apps/web/src/views/new-execution/` + `apps/web/src/routes/executions/new.tsx` (wizard steps with URL step param) and `apps/web/src/views/execution/` + `apps/web/src/routes/executions/$executionId.tsx` (live task statuses, verification summary)

**Checkpoint**: US1 + US2 work — orchestrated runs visible in monitoring views

---

## Phase 5: User Story 3 - Control running executions safely (Priority: P2)

**Goal**: Stop, interrupt, resume, message, approve/reject, retry, assign, request review — capability-gated

**Independent Test**: quickstart V5 — approve one, reject one, stop execution ≤ 5 s, Pause disabled with reason, retry links attempts, all in audit log

### Tests for User Story 3 ⚠️

- [ ] T109 [P] [US3] Unit test `apps/server/tests/unit/runtime-manager/capability-gate.test.ts`: every control on each RuntimeKind matches the capability matrix; unsupported → CAPABILITY_UNSUPPORTED
- [ ] T110 [P] [US3] Integration test `apps/server/tests/integration/controls.test.ts` (fake adapter): stop ≤ 5 s → `stopped`; retry creates attempt+1 linked via `previousAttemptId`; assign task; request review; messages persisted as Message + event; audit entries for each
- [ ] T111 [P] [US3] E2E `e2e/us3-controls.spec.ts`: approvals inbox approve/reject, stop, disabled Pause tooltip text, distinct state badges, axe clean

### Implementation for User Story 3

- [ ] T112 [US3] Implement control operations in `apps/server/src/modules/execution-orchestrator/controls.ts` (controls only for Nexora-started sessions — observed sessions are observe-only; stop, interrupt-and-hold labelled "Interrupt & hold" (API name `pause`) only when all runtimes support interrupt+resume, resume, cancel task, retry, assign additional task, request review by Code Reviewer role, restart session) to pass T109, T110
- [ ] T113 [US3] Implement routes `apps/server/src/http/routes/controls.ts`: `POST /executions/:id/{stop,pause,resume}`, `POST /tasks/:id/{cancel,retry,review}`, `POST /executions/:id/tasks`, `POST /sessions/:id/{stop,interrupt,restart,resume,messages}`, `POST /agents/:id/messages`
- [ ] T114 [P] [US3] Implement feature `apps/web/src/features/control-session/` (buttons derived only from `capabilities`; unsupported disabled with reason tooltip; confirmation dialog for stop)
- [ ] T115 [P] [US3] Implement feature `apps/web/src/features/decide-approval/` + widget `apps/web/src/widgets/approvals-inbox/` (pending list, approve/reject with note, toast on new approval request)
- [ ] T116 [P] [US3] Implement Communication Center widget `apps/web/src/widgets/message-feed/` + entity `apps/web/src/entities/message/` + route `apps/web/src/routes/communication.tsx` (sender, receiver, timestamp, type, related task, summary; live via socket; no hidden reasoning) with component test `apps/web/src/widgets/message-feed/message-feed.test.tsx`
- [ ] T117 [P] [US3] Implement features `apps/web/src/features/{retry-task,send-message,assign-task,request-review}/`
- [ ] T118 [US3] Integrate controls into agent-details-panel, session view and execution view (`apps/web/src/widgets/agent-details-panel/`, `apps/web/src/views/session/`, `apps/web/src/views/execution/`)

**Checkpoint**: Human control complete for Multi-Session and Subagents modes

---

## Phase 6: User Story 4 - Manage tasks on a board (Priority: P2)

**Goal**: Kanban (Backlog, Todo, In Progress, Review, Completed, Failed) with state-valid drag-and-drop

**Independent Test**: quickstart V6 — pending→Todo accepted; running→Completed refused with message

- [ ] T119 [P] [US4] Unit test `apps/server/tests/unit/task-manager/board-move.test.ts`: column derivation (Backlog=pending; Todo=queued; In Progress=planning/running/waiting_for_input/blocked; Review=reviewing; Completed; Failed=failed/cancelled); user move allowed only `pending⇄queued`, else CONFLICT with reason
- [ ] T120 [US4] Implement `PATCH /tasks/:id/status` in `apps/server/src/http/routes/tasks.ts` using `apps/server/src/modules/task-manager/board.ts` to pass T119
- [ ] T121 [US4] Implement widget `apps/web/src/widgets/kanban-board/` (`@dnd-kit`, keyboard-accessible DnD, optimistic move with rollback + toast on 409, filters by execution) and feature `apps/web/src/features/move-task/`; route `apps/web/src/routes/tasks.tsx`
- [ ] T122 [P] [US4] Component test `apps/web/src/widgets/kanban-board/kanban-board.test.tsx` and E2E `e2e/us4-board.spec.ts`

**Checkpoint**: Board usable over any execution

---

## Phase 7: User Story 5 - Build and run workflows (Priority: P3)

**Goal**: Visual, versioned workflows with sequential/parallel steps, conditions, approvals, retries, error paths

**Independent Test**: quickstart V7 — parallel nodes run together, approval waits, retry policy honoured, v2 save keeps v1 runnable

### Tests for User Story 5 ⚠️

- [ ] T123 [P] [US5] Unit test `apps/server/tests/unit/workflow-engine/graph-validator.test.ts`: single start, reachable end, no cycles, node kinds `agent, skill, mcp_tool, condition, approval, parallel_fork, parallel_join, start, end`, retry `maxAttempts ≤ 5`, onError `fail|continue|goto(nodeId)` target exists, skill nodes only for `executable` skills
- [ ] T124 [P] [US5] Unit test `apps/server/tests/unit/workflow-engine/executor.test.ts` (fake node executors): fork/join parallelism, condition branch, approval wait, retry with backoff, error edges, cancellation
- [ ] T125 [P] [US5] Unit test `apps/server/tests/unit/workflow-engine/condition-evaluator.test.ts`: safe expression evaluation (no `eval`/`Function`), access only to previous node outputs

### Implementation for User Story 5

- [ ] T126 [US5] Implement graph validator + versioning repository `apps/server/src/modules/workflow-engine/{graph-validator.ts,workflow.repository.ts}` (versions immutable, increment int) to pass T123
- [ ] T127 [US5] Implement condition evaluator `apps/server/src/modules/workflow-engine/condition-evaluator.ts` (sandboxed expression library, e.g. `filtrex`) to pass T125
- [ ] T128 [US5] Implement executor `apps/server/src/modules/workflow-engine/{executor.ts,node-executors/{agent.ts,skill.ts,mcp-tool.ts,approval.ts}}` (agent → SDK session; skill → SDK session prompted with skill slash command; mcp_tool → SDK session with that MCP server enabled; approval → ApprovalGate) emitting `workflow.started|node_changed|completed` to pass T124
- [ ] T129 [US5] Implement workflow mode executor `apps/server/src/modules/execution-orchestrator/modes/workflow.ts` and routes `apps/server/src/http/routes/workflows.ts` (`GET/POST /workflows`, `GET/POST /workflows/:id/versions`, `POST /workflows/:id/versions/:v/run`)
- [ ] T130 [P] [US5] Add built-in templates `apps/server/src/modules/workflow-engine/templates/{spec-driven.json,tdd-feature.json,review-and-merge.json}` seeded on first run
- [ ] T131 [P] [US5] Implement entity `apps/web/src/entities/workflow/` (api, keys, types)
- [ ] T132 [US5] Implement widget `apps/web/src/widgets/workflow-editor/` (`@xyflow/react`; node palette for agent, skill, MCP tool, condition, approval, parallel fork/join; property panel per node with RHF + zod; live run state overlay per node) and feature `apps/web/src/features/edit-workflow/` (save as new version, run); route `apps/web/src/routes/workflows/index.tsx`, `apps/web/src/routes/workflows/$workflowId.tsx`
- [ ] T133 [P] [US5] Component tests for workflow-editor and E2E `e2e/us5-workflows.spec.ts`

**Checkpoint**: Workflow mode works end-to-end

---

## Phase 8: User Story 6 - Use Agent Teams and Hybrid modes (Priority: P3)

**Goal**: Native Agent Teams via interactive lead in PTY + observation; Hybrid with per-task mechanism explanation

**Independent Test**: quickstart V8 + mode-disabled check when flag unset; no simulated team ever created

### Tests for User Story 6 ⚠️

- [ ] T134 [US6] Spike S2: verify `node-pty` prebuilt install on Windows 10 / Node 22, launch interactive `claude` with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in PTY, create a 2-teammate team, capture hook payloads (TaskCreated, TaskCompleted, TeammateIdle) and team files to `apps/server/tests/fixtures/teams/`; record result + fallback decision in research.md (S2)
- [ ] T135 [P] [US6] Contract test `apps/server/tests/contract/agent-team-adapter.test.ts`: fixtures → team_lead/teammate agents, team tasks, messages from inbox files (`best_effort`), capabilities `canSendMessage: 'lead_only'`, `canPause/canResume: false`
- [ ] T136 [P] [US6] Unit test `apps/server/tests/unit/execution-orchestrator/hybrid-planner.test.ts`: every task in hybrid plan has `mode` + non-empty `mechanismReason`; Agent Teams never chosen when unavailable

### Implementation for User Story 6

- [ ] T137 [US6] Implement PTY adapter `apps/server/src/modules/runtime-manager/adapters/agent-team-pty/{agent-team-pty.adapter.ts,team-files-watcher.ts}` (spawn `claude` interactive in `node-pty` with flag env, initial prompt as input, Ctrl-C interrupt, read-only polling of `~/.claude/teams/<team>/config.json`, `inboxes/*.json`, `~/.claude/tasks/<team>/` — never write them) to pass T135; observe-only fallback when node-pty unavailable
- [ ] T138 [US6] Implement Agent Teams enablement flow: `POST /runtime/agent-teams/enable` in `apps/server/src/http/routes/runtime.ts` writing `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"` to project `.claude/settings.local.json` only after confirm, audited
- [ ] T139 [US6] Implement PTY websocket bridge `apps/server/src/realtime/terminal-gateway.ts` (namespace `/terminal`, only for Nexora-spawned lead sessions, auth required)
- [ ] T140 [US6] Implement mode executors `apps/server/src/modules/execution-orchestrator/modes/{agent-teams.ts,hybrid.ts}` and hybrid planning rules in `apps/server/src/modules/execution-orchestrator/planner/hybrid-planner.ts` to pass T136
- [ ] T141 [P] [US6] Implement widget `apps/web/src/widgets/terminal/` (`@xterm/xterm` bound to `/terminal` socket; `useEffect` allowed — external system: xterm + socket) embedded in agent-details-panel for team leads
- [ ] T142 [P] [US6] Show team task list + teammate statuses on canvas and agent details (`apps/web/src/widgets/agent-canvas/components/team-group.tsx`), and hybrid mechanism/reason column in `apps/web/src/features/approve-plan/`
- [ ] T143 [P] [US6] E2E `e2e/us6-agent-teams.spec.ts` (fixture-driven): disabled mode with enable instructions; team visualisation from fixtures

**Checkpoint**: All five execution modes available (Agent Teams where supported)

---

## Phase 9: User Story 7 - See integrations: skills, agents, MCP servers, GitHub (Priority: P3)

**Goal**: Inventory of skills/agents/MCP with health and permission status; GitHub data via `gh` (installed in T001) and local git

**Independent Test**: quickstart V9 — lists match project, secrets redacted, GitHub view works with gh authenticated and shows guidance when gh missing/unauthenticated

### Tests for User Story 7 ⚠️

- [ ] T144 [P] [US7] Unit test `apps/server/tests/unit/github-integration/gh-status.test.ts`: `gh` missing → `not_installed` + hint `winget install --id GitHub.cli -e`; `gh auth status` failing → `not_authenticated` + hint `gh auth login`; ok → `connected`
- [ ] T145 [P] [US7] Unit test `apps/server/tests/unit/mcp-registry/redaction.test.ts`: MCP configs with `env`/`headers` secrets are never returned; permission status derived from settings `permissions.allow/deny/ask`

### Implementation for User Story 7

- [ ] T146 [US7] Implement integrations service + persistence `apps/server/src/modules/skill-registry/skill-registry.service.ts`, `apps/server/src/modules/mcp-registry/mcp-registry.service.ts` (health: MCP stdio/http reachability check with timeout, `unknown` when not checkable; permission status) and route `GET /integrations?projectId=` in `apps/server/src/http/routes/integrations.ts`
- [ ] T147 [US7] Implement GitHub integration `apps/server/src/modules/github-integration/{gh-status.ts,github.service.ts}` (read-only `gh api` GETs via allowlisted runner: repos, branches, commits, pulls, pull files, reviews; local fallback for branches/commits via `git`) and routes `apps/server/src/http/routes/github.ts` (`GET /github/status`, `GET /github/repos/:owner/:repo/{branches,commits,pulls}`, `GET …/pulls/:n/files`) to pass T144
- [ ] T148 [P] [US7] Implement entities `apps/web/src/entities/{integration,github}/` and view `apps/web/src/views/integrations/` + route `apps/web/src/routes/integrations.tsx` (tabs: Skills, Agents, MCP servers with tools, health, permission status)
- [ ] T149 [P] [US7] Implement view `apps/web/src/views/github/` + route `apps/web/src/routes/github.tsx` (repo picker from registered projects' remotes; branches, commits, PRs, changed files, review status; setup guidance card when `not_installed`/`not_authenticated`)
- [ ] T150 [P] [US7] Component tests for integrations + github views with MSW, E2E `e2e/us7-integrations.spec.ts`

**Checkpoint**: Integrations visible; GitHub live when gh is authenticated

---

## Phase 10: User Story 8 - Drive Nexora from another agent via MCP (Priority: P4)

**Goal**: Optional authenticated MCP endpoint exposing the 14 tools over the same services

**Independent Test**: quickstart V10 — token-authenticated client lists sessions; `start_execution` with risky task returns `approval_required`

- [ ] T151 [P] [US8] Integration test `apps/server/tests/integration/mcp-server.test.ts` (MCP client SDK over Streamable HTTP): disabled by default (404), unauthenticated → 401, `read` token cannot call control tools, invalid input → `isError` with VALIDATION_FAILED, `start_execution` never approves risky tasks, every call audited with actor `mcp_client:<name>`
- [ ] T152 [US8] Implement API token management `apps/server/src/modules/permission-manager/token.service.ts` (hashed storage, scopes `read|control`, create/revoke) and routes `apps/server/src/http/routes/tokens.ts`
- [ ] T153 [US8] Implement MCP server `apps/server/src/mcp/{server.ts,tools/*.ts}` mounted at `/mcp` (tools per `contracts/mcp-tools.md`, zod → JSON Schema inputs, calling existing module services only) to pass T151
- [ ] T154 [P] [US8] Implement settings view `apps/web/src/views/settings/` + route `apps/web/src/routes/settings.tsx` (enable MCP server, create/revoke tokens shown once, remote-access status read-only)

**Checkpoint**: All user stories complete

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T155 [P] Unit test `apps/server/tests/unit/session-manager/recovery.test.ts`: on boot, `running` sessions without a live handle become `unknown`; history preserved; next hook event for that session id re-attaches it as `running`
- [ ] T156 [P] Unit test `apps/server/tests/unit/event-manager/retention.test.ts`: deletes events older than retention (default 30 days, configurable), keeps `error`/approval events and all audit entries, removes matching FTS rows
- [ ] T157 Implement restart recovery `apps/server/src/modules/session-manager/recovery.ts`: on boot mark non-reattachable `running` sessions `unknown`, keep history, re-attach observed sessions on next hook; to pass T155
- [ ] T158 [P] Implement retention job `apps/server/src/modules/event-manager/retention.ts` (default 30 days, configurable; keep error/approval/audit events) to pass T156
- [ ] T159 [P] Load test script `apps/server/scripts/load-test.ts` (10 sessions, 1 000 events/min via ingest) measuring p95 latency from ingest to rendered event in the dashboard (must be ≤ 2 s, SC-001) + Playwright perf check that UI interactions stay ≤ 1 s (SC-007)
- [ ] T160 [P] Secret-leak test `apps/server/tests/integration/secret-leak.test.ts` seeding known secret patterns through hooks, SDK fixtures, MCP configs; assert absent from DB, socket emits, exports, MCP responses (SC-004)
- [ ] T161 [P] Axe accessibility sweep across all routes `e2e/a11y.spec.ts`; dark and light theme screenshots
- [ ] T162 Security review of the branch (`/security-review`), fix findings; verify loopback default and remote refusal (quickstart V11)
- [ ] T163 [P] Documentation in `docs/`: `installation.md`, `configuration.md` (env vars, ports 3022/3023, data dir), `runtime-setup.md` (Claude Code login, Agent Teams flag, node-pty, gh), `mcp-setup.md`, `usage-examples.md`, `troubleshooting.md`, `limitations.md` (no true pause — "Interrupt & hold" = interrupt + resume by session id, API name `pause`; observed sessions are observe-only; team messaging lead-only; estimated cost; best-effort team files)
- [ ] T164 [P] Update root `README.md` (overview, quickstart, screenshots, links to docs) and `CLAUDE.md` (project commands, structure, team-front profile + Rsbuild deviation)
- [ ] T165 Run full `quickstart.md` validation V1–V12 on Windows and record results in `specs/001-ai-orchestration-platform/checklists/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — T001 (gh) independent, can run any time before Phase 9
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all stories
- **US1 (Phase 3)**: after Foundational — MVP
- **US2 (Phase 4)**: after Foundational; reuses US1 session/agent projections for live view (integration, not blocking for backend tests)
- **US3 (Phase 5)**: depends on US2 (needs executions/runtimes to control)
- **US4 (Phase 6)**: depends on US2 task manager (T095)
- **US5 (Phase 7)**: depends on US2 runtime adapters + approval gate (T085, T093)
- **US6 (Phase 8)**: depends on US2 orchestrator (T097) and US1 hook ingest (T057)
- **US7 (Phase 9)**: depends on Foundational + discovery (T088); GitHub part needs T001
- **US8 (Phase 10)**: depends on US2 services (and US3 for control tools)
- **Polish (Phase 11)**: after desired stories

### Story completion order

`Setup → Foundational → US1 (MVP) → US2 → {US3, US4, US5, US7} → US6 → US8 → Polish`

### Within each story

Tests/spikes first and failing → repositories/models → services → routes → web entities → features/widgets → views/routes.

### Parallel Opportunities

- Phase 1: T004–T015 all [P] after T002–T003
- Phase 2: contract files T016–T019 in parallel; server test-first pairs (T021/T022, T023/T024, T025/T026, T027/T028) in parallel streams; web core T040–T042, T046–T048 in parallel
- After Foundational: workstreams with disjoint file ownership — (A) server event pipeline + realtime (US1 server), (B) runtime adapters (US2 T084–T087), (C) web entities/widgets, (D) workflow engine (US5 T123–T128). `packages/contracts` has a single owner; changes via review.
- After US2: US3, US4, US5, US7 in parallel

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "Contract test hook ingest in apps/server/tests/contract/hook-ingest.test.ts"
Task: "Unit test session projection in apps/server/tests/unit/session-manager/session-projection.test.ts"
Task: "Unit test agent tree in apps/server/tests/unit/agent-registry/agent-tree.test.ts"
Task: "Unit test hook installer in apps/server/tests/unit/project-registry/hook-installer.test.ts"

# Web slices together (after T061):
Task: "Entities project/session/agent/event in apps/web/src/entities/"
Task: "Overview stats widget in apps/web/src/widgets/overview-stats/"
Task: "Session table widget in apps/web/src/widgets/session-table/"
```

## Parallel Example: User Story 2

```bash
Task: "Execution state machine test apps/server/tests/unit/execution-orchestrator/execution-state.test.ts"
Task: "Conflict detector test apps/server/tests/unit/execution-orchestrator/conflict-detector.test.ts"
Task: "Scheduler test apps/server/tests/unit/execution-orchestrator/scheduler.test.ts"
Task: "Approval gate test apps/server/tests/unit/permission-manager/approval-gate.test.ts"
Task: "CLI headless adapter apps/server/src/modules/runtime-manager/adapters/cli-headless/"
Task: "Skill/MCP discovery apps/server/src/modules/{skill-registry,mcp-registry}/discovery.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (incl. gh install T001)
2. Phase 2 Foundational
3. Phase 3 US1 → **STOP and VALIDATE** with quickstart V1, V2 → demo live monitoring of real sessions

### Incremental Delivery (each step ends with user approval, per brief §12–13)

1. Foundation → 2. US1 monitoring (MVP) → 3. US2 orchestration → 4. US3 control + US4 board →
5. US5 workflows + US7 integrations → 6. US6 Agent Teams/Hybrid → 7. US8 MCP → 8. Polish + docs

### Parallel Agent Strategy (after Foundational)

- Lead (main session): owns `packages/contracts`, reviews and integrates
- Backend agent A: event pipeline / US1 server · Backend agent B: runtime adapters / US2
- Frontend agent: web entities, widgets, views (team-front standards)
- QA agent: tests-first tasks per story, E2E · Security reviewer: Phase 11 T160, T162
- Each agent works in its own git worktree with disjoint `ownedPaths`

---

## Notes

- [P] = different files, no dependency on incomplete tasks
- Spikes S1–S3 (T049, T071, T134) may change adapter details; update research.md + contracts before dependent tasks
- No placeholder features: anything not working ships as a documented limitation (`docs/limitations.md`)
- Commit after each task or logical group (Conventional Commits)
