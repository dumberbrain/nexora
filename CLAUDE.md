# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

Nexora is a local, single-user control center for Claude Code: a Node server (API + realtime +
MCP + orchestrator over SQLite) and a React dashboard, in an npm-workspaces monorepo. Feature
spec, plan, research and tasks live in `specs/001-ai-orchestration-platform/`; user docs in
`docs/`.

## Commands

Run from the repository root (Node ≥ 22.12, npm ≥ 11; `engine-strict` is on).

| Command                                          | What it does                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `npm ci`                                         | install exact versions (also generates the web route tree)                    |
| `npm run dev`                                    | web (Rsbuild, :3022, proxy) + server (`tsx watch`, :3023)                     |
| `npm run build`                                  | `apps/web` (Rsbuild) then `apps/server` (tsup → `dist/main.js`)               |
| `npm start`                                      | production server on :3022, serves the built SPA                              |
| `npm run start:e2e`                              | production build with `NODE_ENV=test` + `NEXORA_TEST_FAKE_RUNTIME=1`          |
| `npm run lint` / `lint:fix`                      | ESLint (one root flat config), `--max-warnings 0`                             |
| `npm run typecheck`                              | `tsc --noEmit` per workspace (web regenerates routes first)                   |
| `npm run format` / `format:check`                | Prettier (with the Tailwind plugin)                                           |
| `npm test`                                       | Vitest projects: `contracts`, `server`, `web`                                 |
| `npx vitest run <paths>`                         | only the given test files; `--project server` / `web` / `contracts` to narrow |
| `npm run test:e2e`                               | Playwright (chromium, firefox, webkit) + axe on the production build          |
| `npm run db:generate`                            | drizzle-kit migration from `apps/server/src/db/schema.ts`                     |
| `npm run db:migrate`                             | apply migrations to `NEXORA_DATA_DIR` (also done on every server start)       |
| `npm run load-test -w @nexora/server -- --url …` | SC-001 load test (10 sessions, 1 000 events/min, p95 ≤ 2 s)                   |
| `npm run check` / `check:staged`                 | run the husky pre-push / pre-commit checks by hand                            |

E2E uses port 3022 (`NEXORA_E2E_PORT` to change) and reuses a running server outside CI.

## Repository layout

```text
packages/contracts/   zod schemas + types shared by server, web and MCP (entities, REST DTOs,
                      socket events, MCP tools). Change additively; both sides depend on it.
apps/server/
  src/main.ts         entry: loadEnv → createNexoraServer
  src/server.ts       wiring: DB → services → Hono app → Socket.IO → listen
  src/services.ts     US1 services (projects, hooks, sessions, agents, stats, integrations, github)
  src/orchestration.ts runtimes + orchestrator + controls + workflows (US2–US6)
  src/config/env.ts   env parsing, loopback/remote guard
  src/http/           Hono app, routes/, middleware/ (origin guard, session cookie, CSRF, bearer)
  src/realtime/       /live gateway (rooms, replay, 100 ms batching), /terminal (Agent Teams PTY)
  src/mcp/            Streamable HTTP MCP server at /mcp + tools/
  src/db/             drizzle schema, client (WAL, migrations), migrate script
  src/lib/            redactor, path-guard, process (execFile allowlist), logger, ulid, csv
  src/modules/        domain modules (below)
  scripts/            spike-sdk.ts, load-test.ts
  tests/              unit/, contract/ (recorded fixtures), integration/, fixtures/, fakes/
  drizzle/            SQL migrations
apps/web/src/         FSD: app → routes (thin) → views → widgets → features → entities → shared
apps/web/tests/       Vitest setup, MSW handlers, fake socket/xterm, render helper
e2e/                  Playwright specs (us1–us8, perf), fixtures/axe.ts, support/
docs/                 user documentation
```

### Server modules (`apps/server/src/modules`)

| Module                   | Responsibility                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `project-registry`       | registered projects, hook installer (`.claude/settings.local.json`)                                                          |
| `event-manager`          | hook ingest + normaliser, EventStore (redact, cap, FTS), EventBus, stats                                                     |
| `session-manager`        | session projection from hooks/runtimes, liveness monitor, observed capabilities                                              |
| `agent-registry`         | agent tree (main → subagents/teammates) and its repository                                                                   |
| `runtime-manager`        | `RuntimeAdapter` interface, capability profiles, adapters: `agent-sdk`, `cli-headless`, `agent-team-pty`, `fake` (test only) |
| `execution-orchestrator` | analysis, mode advisor, questions, planner, scheduler, modes, controls, verifier                                             |
| `task-manager`           | tasks, board columns and allowed moves                                                                                       |
| `workflow-engine`        | versioned graphs, graph validator, condition evaluator, executor, templates                                                  |
| `permission-manager`     | approvals, scope guard, audit log, API tokens, settings                                                                      |
| `communication-manager`  | messages to sessions/agents (capability-gated)                                                                               |
| `git-workspace`          | execution/task worktrees under `<repo>/.nexora/worktrees`, diffs                                                             |
| `skill-registry`         | skills, commands, agents discovery; integrations service                                                                     |
| `mcp-registry`           | external MCP server discovery, permission status, health probe                                                               |
| `github-integration`     | `gh` status and read-only `gh api` data                                                                                      |

## Frontend profile

- team-front profile: **`shadcn-tailwind-tanstack-router`** (`team-front-skill` v2.1.1) — FSD
  layers, TanStack Router file routes + TanStack Query, Zustand for UI-only state, shadcn/ui
  (Radix) in `shared/ui`, Tailwind CSS v4, react-hook-form + zod, Vitest + Testing Library + MSW,
  Playwright + axe.
- **Deviation: Rsbuild instead of Vite** (user request, research R9). Only the build tool
  differs: `@rsbuild/plugin-react`, TanStack Router via `@tanstack/router-plugin/rspack`
  (`autoCodeSplitting`), Tailwind through PostCSS, env prefix `PUBLIC_` instead of `VITE_`. Dev
  server on 3022 proxies `/api`, `/mcp`, `/socket.io` to 3023. Folder structure, router, UI kit,
  state and testing follow the standard unchanged.
- Rules enforced by ESLint: FSD layer boundaries (`eslint-plugin-boundaries`), ≤ 150 lines per
  `.tsx` component, a11y (`jsx-a11y`), no `console.log` (use the shared logger), minimal `useEffect`
  (allowed for external systems such as the socket).
- Visual language: terminal / CRT phosphor look (tokens in `apps/web/src/app/styles/globals.css`,
  `[01]` indices, `/slash` nav labels); dark default, light theme supported; status colours
  always paired with a text label.

## Architecture rules

- One process serves API, realtime, MCP and (production) the SPA — no logic duplicated between
  REST and MCP; both call the same services.
- Loopback bind by default; non-loopback needs `NEXORA_REMOTE=1` + `NEXORA_TOKEN` (≥ 32 chars).
  Host/Origin guard on HTTP and the WebSocket handshake; cookie + CSRF double-submit for the SPA.
- Secrets go through `lib/redactor` before persisting, logging, socket emit, export and MCP output.
- Only `claude`, `git`, `gh` are spawned, with argument arrays and no shell (`lib/process`).
- Never fake a capability: controls come from the runtime's capability profile; unsupported ⇒
  disabled with a reason / `CAPABILITY_UNSUPPORTED`. No "pause" — "Interrupt & hold".
- Production views use real data only; the fake runtime is reachable only with `NODE_ENV=test`.
- Approvals never auto-approve and never time out; MCP cannot approve.

## Conventions

- TypeScript strict everywhere; exact dependency versions (`save-exact`).
- Tests first for core logic (state machines, scheduler, permissions, redactor); contract tests
  use recorded fixtures in `apps/server/tests/fixtures`.
- Conventional Commits (checked by `.husky/commit-msg`); branch names `feat/…`, `fix/…`, `docs/…`
  etc. or spec-kit `NNN-name`. Pre-commit lints/formats staged files; pre-push runs lint +
  typecheck.
- Prettier: double quotes, trailing commas, width 100, LF.
- **Windows / PowerShell 5.1**: never rewrite text files with `Get-Content`/`Set-Content` — it
  decodes UTF-8 as cp1252 and corrupts characters like `≥` and `—`. Use the Edit/Write tools or
  `node` scripts.
- A dev server that already owns 3022 blocks `npm run test:e2e` — stop it or set
  `NEXORA_E2E_PORT`.
- On Windows, the Agent Teams PTY needs a console: start the server from a real terminal.
