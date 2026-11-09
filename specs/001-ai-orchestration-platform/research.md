# Phase 0 Research: AI Development Orchestration Platform

Sources: official Claude Code docs (code.claude.com/docs/en/{hooks, headless, cli-reference,
agent-sdk/typescript, agent-teams, sub-agents}), local `claude --help` (v2.1.319), team frontend
standards (`team-front-skill` v2.1.1, profile `shadcn-tailwind-tanstack-router`). Every runtime
integration below uses **documented** features only; anything undocumented is listed as a limitation.

Environment detected (2026-11-08): Windows 10, Node 22.21.1, npm 11.7.0, Claude Code 2.1.319,
uv 0.11.1, git 2.35.1; **gh CLI not installed**; `~/.claude/teams` absent (Agent Teams never used).

---

## R1. Managed session runtime (Multi-Session, Subagents, Workflow nodes)

- **Decision**: Primary adapter = **Claude Agent SDK for TypeScript** (`@anthropic-ai/claude-agent-sdk`)
  using `query()` in **streaming-input mode** (AsyncIterable prompt). Secondary adapter = **headless
  CLI** (`claude -p --input-format stream-json --output-format stream-json --verbose`) for users who
  prefer the installed CLI binary; same capability profile minus SDK-only controls.
- **Rationale**: Streaming-input mode is documented as required for `interrupt()`,
  `setPermissionMode()`, `setModel()`, `streamInput()` (send message), `close()`. `canUseTool`
  gives a native approval path (no timeout ⇒ matches "no auto-approve"). `agents` option defines
  subagents programmatically. `resume: sessionId` continues a session later.
- **Capability profile (SDK)**: start ✔, stop ✔ (`close`), interrupt ✔, sendMessage ✔
  (`streamInput`), setPermissionMode ✔, resume ✔ (new query with `resume`), restart ✔ (close +
  resume), **pause ✘** (not documented). UI shows "Interrupt" and "Resume", never a fake "Pause".
  Execution-level "pause" = interrupt all + mark `paused`; only offered when every runtime has
  interrupt+resume, and labelled "Interrupt & hold".
- **Alternatives**: PTY-driving interactive `claude` for all modes — rejected (screen-scraping,
  fragile, no structured events); raw Anthropic Messages API — rejected (would re-implement Claude
  Code tools, violates "use Claude Code").

## R2. Event capture

- **Decision**: Three sources, normalised by Event Manager:
  1. **Claude Code `http` hooks** → `POST http://127.0.0.1:3022/api/v1/hooks/ingest` for sessions
     *not* started by Nexora (observed sessions, Agent Teams). Events used: SessionStart, SessionEnd,
     UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest,
     PermissionDenied, Notification, SubagentStart, SubagentStop, TaskCreated, TaskCompleted,
     TeammateIdle, Stop, StopFailure, FileChanged, WorktreeCreate, WorktreeRemove, CwdChanged.
  2. **SDK / stream-json messages** for Nexora-managed sessions (`system:init`, `assistant`, `user`
     with `parent_tool_use_id` ⇒ subagent tree, `result` with `usage`, `modelUsage`,
     `total_cost_usd`). SDK `hooks` option + `includeHookEvents` for tool/subagent events
     in-process.
  3. **Agent Teams files** (read-only polling of `~/.claude/teams/<team>/config.json`,
     `inboxes/*.json`, `~/.claude/tasks/<team>/`) — reliability `best_effort`; docs say "do not
     edit" ⇒ Nexora never writes them.
- **Rationale**: hooks are the only documented way to see sessions Nexora did not spawn; `http`
  type avoids shipping a helper script. Common fields `session_id, cwd, hook_event_name,
  transcript_path, agent_id, agent_type, tool_use_id` give the joins we need.
- **Hook install**: written to the project's `.claude/settings.local.json` (git-ignored) only after
  the user previews the diff and confirms (FR-041). Per-project secret sent as a request header;
  if `http` hook header support turns out insufficient, fall back to a token in the URL query
  (loopback only). → verified by spike task in Phase 3.
- **Reliability tagging**: `authoritative` (SDK messages, hooks), `derived` (git-diff file changes,
  board column), `best_effort` (team file polling). Shown in Live Logs and Agent Details.
- **Cost**: `total_cost_usd` is documented as a client-side estimate ⇒ UI label "≈ estimated";
  `modelUsage` used for token totals; absent ⇒ "not available" (FR-029).

## R3. Agent Teams mode

- **Decision**: Supported only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set (env or
  settings `env`) — detected by Runtime Manager. Because teams are **not available in `-p` or SDK
  sessions**, Nexora launches the team lead as an **interactive `claude` process inside a
  pseudo-terminal** (`node-pty`), sends the initial prompt as typed input, and observes via hooks
  (TaskCreated, TaskCompleted, TeammateIdle, SubagentStart/Stop with `agent_id`) + team files.
  A terminal panel (xterm.js) in Agent Details lets the user interact directly.
- **Capability profile**: start ✔, stop ✔ (SIGTERM / Ctrl-C), sendMessage ✔ to **lead only**
  (PTY input, `best_effort`), message individual teammates ✘ (no documented external API),
  pause ✘, resume ✘ (in-process teammates not restored on resume — documented limitation).
- **Never** emulated with subagents (spec FR-011). If the flag is absent the mode is disabled with
  "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 — Nexora can add it to project settings after you
  confirm".
- **Alternatives**: observe-only (user starts lead in own terminal) — kept as fallback when
  `node-pty` prebuilt binary is unavailable on the platform.
- **Risk**: experimental feature, schemas may change ⇒ adapter isolated, contract-tested against
  recorded fixtures, version-gated.

## R4. Subagents mode

- **Decision**: One SDK session; Nexora writes role definitions (Architect, Frontend Developer,
  Backend Developer, Database Engineer, QA Engineer, Security Reviewer, Code Reviewer, DevOps
  Engineer) as SDK `agents` (description, prompt, tools, model, permissionMode) — not files, unless
  the user chooses "save to `.claude/agents/`". Existing project/user agent files are discovered
  and reused. Tree built from `parent_tool_use_id` + SubagentStart/Stop `agent_id/agent_type`.
  Completion report = subagent's final user-visible text.

## R5. Multi-Session isolation & conflicts

- **Decision**: Planner assigns each task `ownedPaths` globs. Parallel tasks with overlapping
  globs ⇒ either serialised or each gets its own **git worktree** (`git worktree add
  <repo>/.nexora/worktrees/<execution>/<task> -b nexora/<execution>/<task>`), created by Nexora's
  Git service (not `claude -w`, so Nexora controls names/cleanup). SDK session `cwd` = worktree.
  Merge back via a review task (Code Reviewer) + user approval; Nexora never force-pushes.
- **Coordinator / message bus**: in-process Communication Manager; messages to managed sessions
  delivered with `streamInput`; every message is an `Event` + `Message` row.
- **Concurrency**: default max 4 parallel sessions (configurable ≤ 8); `maxBudgetUsd` /
  `maxTurns` passed per session where user set budgets.

## R6. Workflow engine

- **Decision**: Own engine in server (`modules/workflow-engine`): versioned JSON graph (data-model),
  executor = topological scheduler with fork/join, condition nodes (expressions over previous node
  outputs, evaluated by a safe sandboxed evaluator such as `jsonata`/`filtrex`, no `eval`), approval
  nodes (create ApprovalRequest, wait), retry with backoff, error edges. Node executors: `agent` →
  SDK session; `skill` → SDK session prompted with the skill slash command, **only** for skills the
  Skill Registry marks `executable` (user-invocable skills/commands); `mcp_tool` → call via the
  SDK session with that MCP server enabled (Nexora does not call third-party MCP servers directly
  in v1). Existing `.specify/workflows/*.yml` etc. are listed but not executed unless an adapter
  exists (shown as "not executable").
- **Alternatives**: Temporal / BullMQ — rejected (extra infra, constitution YAGNI).

## R7. Backend framework: Hono + Socket.IO

- **Decision**: Hono on `@hono/node-server`; Socket.IO server attached to the same Node
  `http.Server` (`new Server(httpServer, { path: '/socket.io' })`). Validation with
  `@hono/zod-validator`; schemas from `@nexora/contracts`. MCP via `@modelcontextprotocol/sdk`
  Streamable HTTP transport mounted at `/mcp`.
- **Process model**: single Node process = API + realtime + MCP + orchestrator ⇒ no duplicated
  logic (FR-043). Child processes only for Claude runtimes, git, gh.
- **Rationale**: user choice; Hono is small, typed, Web-standard handlers, testable via
  `app.request()` without network.

## R8. Persistence: SQLite + Drizzle

- **Decision**: `better-sqlite3` driver (sync, fastest, prebuilt for Node 22 on Windows) +
  `drizzle-orm` + `drizzle-kit` migrations; WAL mode; FTS5 table for event search; DB at
  `~/.nexora/nexora.db` (override `NEXORA_DATA_DIR`). Event writes batched in a transaction every
  100 ms. Alternative `node:sqlite` built-in — rejected for now (still experimental flag in Node 22).

## R9. Frontend: React + Rsbuild + team standards

- **Decision**: Profile `shadcn-tailwind-tanstack-router` (FSD layers: app, routes (thin), views,
  widgets, features, entities, shared) with **Rsbuild** instead of Vite (user request). Mapping:
  - `@rsbuild/plugin-react`; TanStack Router file routes via `@tanstack/router-plugin/rspack`
    (`TanStackRouterRspack({ target: 'react', autoCodeSplitting: true })` in `tools.rspack.plugins`);
  - Tailwind CSS v4 via PostCSS (`@tailwindcss/postcss`) — Rsbuild has built-in PostCSS;
  - env prefix `PUBLIC_` (Rsbuild) instead of `VITE_`; only non-secret values;
  - React Compiler via `babel-plugin-react-compiler` through `@rsbuild/plugin-babel` (optional,
    measured first);
  - dev server port **3022** with `server.proxy` for `/api`, `/socket.io` (ws), `/mcp` → backend
    dev port 3023; production: backend serves `apps/web/dist` on 3022 (single port).
  - CSP via `html.tags` meta + backend `secureHeaders` (Hono) for production.
- **Libraries**: shadcn/ui (Radix) in `shared/ui`, `@xyflow/react` (React Flow) for Agent Canvas and
  Workflow editor, `@dnd-kit` for Kanban, TanStack Query (key factories, `setQueryData` from socket
  `entity.changed`), Zustand (`createResettableStore`) for UI-only state (selected agent, panels,
  theme), `socket.io-client`, axios via `shared/api/http.ts`, `react-hook-form` + zod for forms,
  `sonner` toasts, `@xterm/xterm` terminal for Agent Teams lead.
- **Rules applied**: ≤150 lines per `.tsx`, minimal `useEffect` (allowed: socket subscription =
  external system), no `console.log` (shared logger), a11y, dark default + light theme.
- **Deviation report** (team standard expects Vite): build tool only; folder structure, router,
  UI kit, state, testing unchanged. CI bundle check uses `size-limit` against Rsbuild output.
- **Visual language** (user request 2026-11-08): match https://reactivite.vercel.app/ — terminal /
  CRT phosphor aesthetic. Tokens in `apps/web/src/app/styles/globals.css`: near-black surfaces
  (`#020202`, panels `#07090b`), phosphor accent `#4ade80` with soft glow, hairline `zinc-800`
  borders, radius 0.25rem; fonts self-hosted via `@fontsource` — Chakra Petch (uppercase display
  headings, `text-display`), Geist Mono (body, default), Geist (sans); `[01]` bracket indices
  (`text-index`), `/SLASH` nav labels, `corner-brackets` on selected panels, faint
  `bg-terminal-grid`. Optional decorative glyph-rain only on empty states/landing, disabled under
  `prefers-reduced-motion`, never behind data tables. Light theme keeps structure with green
  primary. Status colours stay distinct and always paired with a text label (FR-032).

## S1 result — http hooks (2026-11-08, Claude Code 2.1.319)

Run: `claude -p … --settings <file> --model haiku`, http hooks for every R2 event → local echo
server; main agent delegated a Write to a general-purpose subagent. Fixtures (paths scrubbed):
`apps/server/tests/fixtures/hooks/*.json`, stream: `apps/server/tests/fixtures/stream-json/`.

- **Custom headers work**: `headers: { "X-Nexora-Hook-Token": "…" }` arrived on every POST →
  the installer uses the header (no query token). Requests come from Claude Code with UA `axios`.
- **SessionStart is not delivered to `http` hooks** (only command hooks ran for it). ⇒ the session
  projection creates a session on the *first event of any type* for an unknown `session_id`.
- Received: UserPromptSubmit, PreToolUse, PostToolUse, SubagentStart, SubagentStop, Stop,
  SessionEnd (+ `reason`). Not exercised in this run: PermissionRequest, Notification, failures,
  TaskCreated/Completed, TeammateIdle, FileChanged, worktree events.
- Common fields: `session_id, transcript_path, cwd, prompt_id, hook_event_name`; tool events add
  `permission_mode, effort, tool_name, tool_input, tool_use_id` (+ `tool_response, duration_ms` on
  PostToolUse). Events from inside a subagent carry `agent_id` + `agent_type`.
- **SubagentStart has no tool_use_id** — only `agent_id, agent_type`. Parent linkage is derived:
  the subagent's parent is the caller (`agent_id` or main) of the most recent unmatched
  `PreToolUse` with `tool_name: "Agent"` in that session (reliability `derived`).
- SubagentStop carries `last_assistant_message` (completion summary) and `agent_transcript_path`.
- The main agent's spawn call is tool `Agent` (input has `description`, `prompt`,
  `subagent_type`).
- **Installer deliberately skips `WorktreeCreate` / `WorktreeRemove`**: per the hooks docs a hook
  on these events *replaces* Claude Code's own git-worktree handling, so an `{}` answer could break
  worktrees (not exercised in S1). Worktree activity of observed sessions is therefore not
  captured in US1; Nexora-managed worktrees are tracked by the git-workspace module (US2).
- Parent-link bookkeeping (pending `Agent` calls) is in memory; after a server restart an orphaned
  subagent is attached to the main agent.

## S3 result — Agent SDK streaming / interrupt / resume (2026-11-08, SDK 0.3.319)

Script `apps/server/scripts/spike-sdk.ts` (model haiku, `settingSources: []`); fixtures in
`apps/server/tests/fixtures/sdk/{phase1,phase2-resume,permissions,hooks}.jsonl`.

- **Streaming input works**: a push-based `AsyncIterable<SDKUserMessage>` (`{type:"user",
  message:{role:"user",content}, parent_tool_use_id:null}`) drives the session; a second message
  pushed after a `result` starts a new turn in the same session (a new `system/init` is emitted).
- **`canUseTool` fired for the `PowerShell` tool** (the model wrote the file with a shell command on
  Windows, not `Write`). Options passed: `suggestions, blockedPath, decisionReasonType, displayName,
  description, toolUseID, requestId, signal`. ⇒ the scope guard must treat **Bash and PowerShell** as
  shell tools (route to ApprovalGate), not only file tools.
- **SDK `hooks.PreToolUse` callback fired** with `(input, toolUseID)`; main-agent input has no
  `agent_id`. `includeHookEvents: true` produced no extra system messages for SDK callbacks.
- **`interrupt()` resolves `{ still_queued: [] }`; the turn then ends with
  `result.subtype = "error_during_execution"`, `is_error: true`.** Nexora maps a result that
  follows its own interrupt to status *interrupted*, not failed.
- **Resume works**: a new `query({ resume: sessionId })` reports the same `session_id` and kept the
  context (answered "a.txt").
- `result` carries `total_cost_usd` (**cumulative per session** — identical on the interrupted turn),
  `usage` (main loop only) and `modelUsage` keyed by model id ⇒ usage = sum over `modelUsage`,
  cost labelled "estimate".
- `system/init` reports `model` (e.g. `claude-haiku-5-5`), `permissionMode`, `cwd`, `tools`.
- Also emitted: `rate_limit_event`, `system/commands_changed` (ignored by the mapper).
- No pause primitive exists (confirms R1): "Interrupt & hold" = `interrupt()` then `resume`.

## S2 result — Agent Teams lead under a PTY (2026-11-09, Claude Code 2.1.321, Windows 10, Node 22.23)

Run: interactive `claude --model haiku --permission-mode acceptEdits` in `node-pty`, flag
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, scratch git repo, prompt "team of 2 teammates, one writes
hello.txt, one bye.txt, then shut down and clean up". Done in 32 s, both files written. Fixtures
(sanitised: `<HOME>`, `<REPO>`, `<HOST>`): `apps/server/tests/fixtures/teams/` — `hooks/*.json`
(42 payloads in order) and `snapshots/<n>-<stage>/teams/<team>/{config.json,inboxes/*.json}`.

- **node-pty**: `1.0.0` has no Windows prebuild (node-gyp build fails without build tools) —
  **`1.1.0` ships `win32-x64` prebuilds and works**; pin it. ConPTY needs a console: under a
  console-less parent (Git Bash) spawn hangs; the server started from a terminal is fine.
  `pty.kill()` throws `AttachConsole failed` on Windows ⇒ stop with `taskkill /T /F /PID <pid>`
  (Ctrl-C via PTY input for a polite interrupt).
- **Environment**: a child started from inside another Claude Code session inherits
  `CLAUDECODE` / `CLAUDE_CODE_*` markers (e.g. `CLAUDE_CODE_CHILD_SESSION` turns transcripts off).
  The adapter strips every `CLAUDECODE*` / `CLAUDE_CODE_*` variable except
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
- **Start-up dialogs** (interactive only): workspace trust for a new folder — default option is
  **"No, exit"**, so the adapter must not blindly press Enter; and "New MCP server found" when the
  worktree has `.mcp.json` (default "continue without"). Decision: Nexora never auto-accepts
  trust; the lead's terminal is shown (T139/T141) and the session waits in
  `waiting_for_input` until the user answers there.
- **Team files**: a team `session-<first 8 of session id>` is created **at session start**, before
  any teammate: `~/.claude/teams/<team>/config.json` with `leadSessionId`, `leadAgentId`
  (`team-lead@<team>`), `leadProcess.pid` (= PTY pid ⇒ how Nexora finds *its* team),
  `members[]` (`agentId`, `name`, `agentType`, `cwd`, `backendType: "in-process"`, `joinedAt`).
  Members are appended as teammates spawn and removed on shutdown (lead remains). Inboxes:
  `inboxes/<member>.json` = array of `{from, text, timestamp, msg_id, type, read, …}`; `text` may
  itself be JSON (`idle_notification`, `shutdown_request/response`). Inboxes are **emptied within
  seconds** once read ⇒ polling is `best_effort` (confirms R3). `~/.claude/tasks/<team>/` existed
  but stayed empty (the lead did not use the shared task list for this small job).
- **Hooks**: teammates appear as `SubagentStart/Stop` with `agent_id` (`a<name>-<hex>`) and
  `agent_type` = teammate name; `TeammateIdle` carries `teammate_name` + `team_name`; tool hooks
  carry the teammate's `agent_id`. Team tools are deferred (`TeamCreate`, `TeamDelete`,
  `SendMessage` with a `shutdown_request` / `shutdown_response` protocol). `TaskCreated` /
  `TaskCompleted` did **not** fire in this run (no shared tasks) — the contract test covers them
  only through the documented payload shape, marked as such.
- **Decision**: PTY adapter is viable on Windows with `node-pty@1.1.0`; keep the observe-only
  fallback for when the native module cannot load.

## R13. Toolchain versions (Phase 1, 2026-11-08)

- **TypeScript 6.0.3**, not 7.0: `typescript-eslint` 8.72 peer range is `<6.1.0` (TS 7 is the
  native Go compiler without the JS API typed linting needs).
- **ESLint 9.39** (not 10): `eslint-plugin-import` does not support ESLint 10 yet. ESLint 9
  resolves config from cwd, so the monorepo uses one root `eslint.config.mjs`.
- **Vitest 5**: `test.projects` in root `vitest.config.ts` replaces `vitest.workspace.ts`.
- **Git hooks**: user's `husky-set` layout (lib.sh, numbered steps, branch gate allowing spec-kit
  `NNN-name` branches, commit-msg conventional check, pre-push sweep) instead of
  lint-staged + commitlint — user decision.
- `@tanstack/react-router-devtools` is the current name of `@tanstack/router-devtools`.

## R10. Monorepo layout & tooling

- **Decision**: npm workspaces (npm detected; no other lockfile): `apps/web`, `apps/server`,
  `packages/contracts` (zod schemas + inferred types shared by web, server, MCP). TypeScript 5
  strict, ESLint flat config + Prettier, husky + lint-staged + commitlint (Conventional Commits per
  constitution), Vitest workspaces (server unit/integration, web component tests with
  Testing Library + MSW), Playwright E2E + `@axe-core/playwright` against production build on 3022.
- **Test doubles**: a **FakeRuntimeAdapter** implementing the runtime interface for tests only
  (never reachable in production views — FR-061); recorded hook/stream-json fixtures for contract
  tests.

## R11. Security

- Bind `127.0.0.1` by default; `NEXORA_HOST` other than loopback refused unless
  `NEXORA_REMOTE=1` **and** an auth token is configured (FR-050).
- Loopback web auth: per-install random secret ⇒ `HttpOnly SameSite=Strict` cookie issued on first
  load from loopback + CSRF header; Host/Origin header check (DNS-rebinding protection).
- Command allowlist: Nexora spawns only `claude`, `git`, `gh` with argument arrays (`execFile`, no
  shell). Paths normalised + verified inside registered project roots (FR-051).
- Redaction: pattern + entropy-based redactor (API keys, tokens, `Authorization`, `.env` values,
  private keys) applied before persistence, socket emit, export and MCP output (FR-052).
- Permission mode default `default`; `bypassPermissions` / `--dangerously-skip-permissions`
  never default, requires per-execution typed confirmation + audit (FR-053).
- Approvals: SDK `canUseTool` + `PreToolUse`/`PermissionRequest` hook responses for managed
  sessions; risky plan tasks gated before start (FR-033).

## R12. GitHub

- **Decision**: GitHub adapter shells `gh api` (read-only GETs) and `gh auth status`. Since `gh` is
  not installed, view shows setup guidance (`winget install GitHub.cli`, `gh auth login`). Local
  git data (branches, commits, diff) comes from `git` directly and works without gh.

## Resolved unknowns

All Technical Context items resolved; no NEEDS CLARIFICATION remains. Open verification spikes
(not blockers, scheduled as first tasks of their phase): S1 http-hook header support & payload
fixtures; S2 node-pty prebuilt on Windows + Agent Teams lead under PTY; S3 SDK streaming-input
`interrupt`/`resume` round-trip on installed version.
