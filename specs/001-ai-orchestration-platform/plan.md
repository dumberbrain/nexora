# Implementation Plan: AI Development Orchestration Platform

**Branch**: `001-ai-orchestration-platform` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-ai-orchestration-platform/spec.md`

## Summary

Ubuliera is a local, single-user control center that analyses a natural-language development task,
recommends and runs one of five Claude Code execution modes (Multi-Session, Agent Teams,
Subagents, Workflow, Hybrid), and shows all activity live at `http://localhost:3022`.
Technical approach (see [research.md](research.md)): one Node process (Hono API + Socket.IO +
MCP endpoint + orchestrator) over SQLite/Drizzle; runtimes behind a common adapter interface with
honest capability profiles — Claude Agent SDK (managed sessions), headless CLI, PTY-hosted
interactive lead for native Agent Teams, and hook-observed external sessions. React SPA built with
Rsbuild following the team frontend standard (FSD, TanStack Router/Query, Zustand, shadcn/ui,
React Flow).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 22 LTS (detected 22.21.1)

**Primary Dependencies**:
- Backend: Hono + `@hono/node-server`, Socket.IO 4, Drizzle ORM + `better-sqlite3`, Zod,
  `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `node-pty` (Agent Teams lead only)
- Frontend: React 19, Rsbuild (`@rsbuild/plugin-react`), TanStack Router (rspack plugin) + Query,
  Zustand, Tailwind CSS v4, shadcn/ui, `@xyflow/react`, `@dnd-kit`, `socket.io-client`, axios,
  react-hook-form + zod, `@xterm/xterm`
- Shared: `@ubuliera/contracts` (zod schemas)

**Storage**: SQLite file `~/.ubuliera/ubuliera.db` (WAL, FTS5 for event search)

**Testing**: Vitest (server unit/contract/integration; web components with Testing Library + MSW),
Playwright + `@axe-core/playwright` (E2E on production build)

**Target Platform**: Developer workstation — Windows 10+, macOS, Linux; modern Chromium/Firefox/Safari

**Project Type**: Web application (local server + SPA) in an npm-workspaces monorepo

**Performance Goals**: event visible ≤ 2 s p95 (SC-001); UI interactions ≤ 1 s with 10 sessions and
1 000 events/min (SC-007); replay ≤ 5 000 events after reconnect

**Constraints**: loopback bind by default; no undocumented Claude APIs; no fabricated data in
production views; ≤ 150-line components; permission bypass never default

**Scale/Scope**: 1 user, ≤ 8 parallel managed sessions, 10 dashboard views, ~14 server modules,
30-day event retention

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|---|---|---|---|
| I. Spec-Driven | spec → plan → tasks before code; testable acceptance criteria | ✔ spec has 8 independent stories, 10 SCs | ✔ quickstart maps V1–V12 to stories |
| II. Human Control & Agent Safety (v2.0.0) | least privilege, approvals for destructive/outward actions, Ubuliera-started work stoppable, interrupt/pause/resume only where supported else shown unavailable, observed sessions labelled observe-only, secrets never exposed | ✔ FR-030–034, FR-050–054 | ✔ ApprovalGate never auto-approves; capability-gated controls; "Interrupt & hold" instead of fake pause; redaction before persist/emit/export/MCP; `bypassPermissions` opt-in only |
| III. Observability | structured events for every state change, audit trail, visible staleness | ✔ FR-020–029 | ✔ Event entity w/ source+reliability; AuditEntry append-only; replay protocol |
| IV. Contract-Based Integrations | typed adapters, isolation, contract tests | ✔ | ✔ RuntimeAdapter interface + capability matrix; adapter failures isolated per session; fixtures-based contract tests |
| V. Test-First Quality | TDD for core logic, integration tests on boundaries, CI gate, YAGNI | ✔ | ✔ state machines/scheduler/permission/redactor test-first; own workflow engine instead of Temporal (YAGNI) |
| Security constraints | isolated workspaces, scope enforcement, untrusted content as data, secrets in env, limits incl. timeouts, pinned deps | ✔ FR-034 | ✔ execution-level worktree for every managed session + per-task worktrees on conflict; scope-guard on PreToolUse + canUseTool; liveness monitor (idle/turn timeouts); execFile allowlist; path validation; budgets/concurrency; exact versions |
| Workflow gates | feature branch, Conventional Commits, reviewed PRs | ✔ | ✔ husky + commitlint planned |

**Result**: PASS (no violations; Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-orchestration-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── rest-api.md
│   ├── socket-events.md
│   ├── runtime-adapter.md
│   └── mcp-tools.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
package.json                 # npm workspaces, root scripts (dev, build, start, lint, test, test:e2e)
packages/
└── contracts/src/           # zod schemas + types: events, entities, REST DTOs, socket, capabilities
apps/
├── server/
│   ├── src/
│   │   ├── main.ts                  # bootstrap: config → db → modules → Hono + Socket.IO on 3022/3023
│   │   ├── config/                  # env parsing (zod), loopback/remote guard
│   │   ├── http/                    # Hono app, routes per module, auth/csrf/origin middleware, error mapper
│   │   ├── realtime/                # Socket.IO gateway, rooms, replay, batching
│   │   ├── mcp/                     # MCP server (Streamable HTTP at /mcp) → module services
│   │   ├── db/                      # drizzle schema, migrations, repositories
│   │   ├── lib/                     # redactor, path-guard, process (execFile allowlist), ulid, logger
│   │   └── modules/
│   │       ├── agent-registry/      ├── session-manager/     ├── runtime-manager/
│   │       │                        │                        │   ├── runtime-adapter.ts
│   │       │                        │                        │   ├── adapters/{agent-sdk,cli-headless,agent-team-pty,external-observed}/
│   │       ├── execution-orchestrator/ (analysis, mode-advisor, planner, verifier)
│   │       ├── task-manager/        ├── workflow-engine/     ├── skill-registry/
│   │       ├── mcp-registry/        ├── event-manager/       (hook ingest, normaliser, store)
│   │       ├── communication-manager/ ├── github-integration/ ├── permission-manager/ (approvals, audit, scope-guard, tokens)
│   │       ├── project-registry/    # projects, hook installer
│   │       └── git-workspace/       # worktrees, diffs
│   └── tests/{unit,contract,integration,fixtures}/
└── web/
    ├── rsbuild.config.ts            # port 3022, proxy → 3023, TanStack Router rspack plugin
    ├── src/
    │   ├── app/                     # providers, router, query-client, socket bridge, theme, styles
    │   ├── routes/                  # thin file routes: index, canvas, sessions, sessions.$id, agents.$id,
    │   │                            # tasks, workflows, communication, logs, integrations, github, executions.new,
    │   │                            # executions.$id, settings
    │   ├── views/                   # page compositions per route
    │   ├── widgets/                 # overview-stats, agent-canvas, session-table, kanban-board,
    │   │                            # workflow-editor, log-viewer, message-feed, agent-details-panel, terminal
    │   ├── features/                # submit-task, choose-mode, answer-questions, approve-plan, control-session,
    │   │                            # decide-approval, move-task, retry-task, send-message, filter-events,
    │   │                            # export-events, install-hooks, edit-workflow, toggle-theme
    │   ├── entities/                # execution, task, session, agent, event, message, approval, workflow,
    │   │                            # integration, project (api queries + key factories + ui atoms)
    │   └── shared/                  # ui (shadcn), api/http.ts, socket, lib/logger, config/env
    └── tests/ (vitest setup, msw handlers)
e2e/                                  # Playwright specs + axe
```

**Structure Decision**: npm-workspaces monorepo with `apps/server`, `apps/web`,
`packages/contracts`. Server is modular by the 13 modules named in the brief (+ git-workspace);
web follows FSD per team standard. One process serves API, realtime, MCP and (in production) the
built SPA on port 3022.

## Delivery phases (each gated by user approval)

| Phase | Scope | Stories |
|---|---|---|
| 1 Foundation | monorepo, tooling, contracts, DB schema/migrations, Hono+Socket.IO skeleton, security middleware, web shell (FSD, theme, routing), port 3022 | — |
| 2 Dashboard + Observation | hook install/ingest, event pipeline + replay, Overview, Sessions, Agent Canvas, Agent Details, Live Logs | US1 (MVP) |
| 3 Claude integration | runtime adapters (SDK, CLI), capability profiles, session lifecycle, spikes S1–S3 | US1/US2 |
| 4 Execution modes | analysis, mode advisor, questions, planner, approvals, Multi-Session (worktrees), Subagents, Agent Teams (PTY), Hybrid | US2, US3, US6 |
| 5 Advanced | Task board, Workflow engine + editor, Skills/MCP/GitHub views, Communication center, Ubuliera MCP server | US4, US5, US7, US8 |
| 6 Reliability | error recovery, restart re-attach, load test (SC-007), security review, E2E suite | all |
| 7 Docs | install, config, runtime setup, MCP setup, examples, troubleshooting | FR-063 |

**Parallel workstreams after Phase 1** (disjoint file ownership): (A) server event pipeline +
realtime, (B) runtime adapters, (C) web shell + entities + widgets, (D) workflow engine — all
coordinate only through `packages/contracts`, which is owned by one lead and changed via review.

## Complexity Tracking

No constitution violations to justify.
