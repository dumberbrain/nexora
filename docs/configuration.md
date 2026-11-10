# Configuration

Nexora is configured only through environment variables, parsed and validated at start-up by
`apps/server/src/config/env.ts`. An invalid or unsafe combination stops the server with an
explanation instead of starting in a weaker mode.

## Environment variables

| Variable                   | Default                                          | Meaning                                                                                                                               |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`                                    | `development`, `production` or `test`. `npm start` sets `production`, `npm run dev` sets `development`.                               |
| `NEXORA_HOST`              | `127.0.0.1`                                      | Bind address. Anything other than `127.0.0.1`, `::1` or `localhost` is refused unless remote mode is configured (below).              |
| `NEXORA_PORT`              | `3022` (production, test) · `3023` (development) | HTTP port of the server. In development the Rsbuild dev server owns 3022 and proxies to 3023.                                         |
| `NEXORA_REMOTE`            | unset (`0`)                                      | `1` opts in to a non-loopback bind. Requires `NEXORA_TOKEN`.                                                                          |
| `NEXORA_TOKEN`             | unset                                            | Shared secret, at least 32 characters. Required with `NEXORA_REMOTE=1`; validated for length whenever it is set.                      |
| `NEXORA_DATA_DIR`          | `~/.nexora` (test: `<os tmp>/nexora-test-<pid>`) | Directory holding `nexora.db` (SQLite, WAL). Created if missing.                                                                      |
| `NEXORA_PUBLIC_URL`        | `http://127.0.0.1:3022`                          | Base URL written into installed hooks (`<url>/api/v1/hooks/ingest`) and shown as the MCP endpoint (`<url>/mcp`). Must be a valid URL. |
| `NEXORA_LOG_LEVEL`         | `info`                                           | pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). Logs are JSON on stdout and pass through the secret redactor.    |
| `NEXORA_RETENTION_DAYS`    | `30`                                             | Days to keep events (1–36500). Older events are purged at boot and every 6 h; error/approval events and audit entries are kept.       |
| `NEXORA_TEST_FAKE_RUNTIME` | unset                                            | `1` replaces the Claude runtimes with a scripted fake. **Only allowed with `NODE_ENV=test`** — the server refuses to start otherwise. |
| `NEXORA_E2E_PORT`          | `3022`                                           | Playwright only (`playwright.config.ts`): port of the E2E server, for when 3022 is already in use.                                    |

Variables read by the runtimes rather than by Nexora's config:

| Variable                               | Effect in Nexora                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | `1` (in the server's environment, `~/.claude/settings.json` `env`, or a registered project's `.claude/settings(.local).json` `env`) enables Agent Teams mode. |
| `ANTHROPIC_API_KEY`                    | When set, the runtime check treats Claude Code as authenticated without running `claude auth status`.                                                         |

## Ports

| Mode                     | 3022                                   | 3023                 |
| ------------------------ | -------------------------------------- | -------------------- |
| `npm start` (production) | API + realtime + MCP + built dashboard | —                    |
| `npm run dev`            | Rsbuild dev server (dashboard, proxy)  | API + realtime + MCP |
| `npm run test:e2e`       | production build, `NODE_ENV=test`      | —                    |

The Host/Origin guard (DNS-rebinding protection) accepts loopback names (`127.0.0.1`,
`localhost`, `[::1]`) on the server's own port **and** on 3022. If you change `NEXORA_PORT` in
production, open the dashboard on that port and set `NEXORA_PUBLIC_URL` to match, otherwise
installed hooks keep posting to 3022.

## Data directory

`NEXORA_DATA_DIR` (default `~/.nexora`) contains only `nexora.db` plus SQLite's `-wal`/`-shm`
files. It stores projects, executions, tasks, sessions, agents, events (with full-text index),
messages, approvals, workflows, the append-only audit log, API token **hashes** and settings.
Secrets are redacted before anything is stored. Migrations (`apps/server/drizzle`) run on every
start; `npm run db:migrate` applies them without starting the server.

Per project, Nexora may also write:

- `<project>/.claude/settings.local.json` — Nexora `http` hooks (after you confirm the preview)
  and, if you opt in, `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"`. Other keys are preserved.
  Claude Code git-ignores this file.
- `<project>/.nexora/worktrees/<execution>/…` — git worktrees on `nexora/<execution>…` branches for
  managed executions. `.nexora/` is added to the repository's local git exclude.

## Remote access (opt-in)

Nexora binds to loopback by default and should never be exposed directly to the internet. To
reach it from another machine (e.g. through an SSH tunnel or an HTTPS reverse proxy):

```bash
NEXORA_HOST=0.0.0.0 NEXORA_REMOTE=1 NEXORA_TOKEN=<≥ 32 random chars> npm start
```

- Without `NEXORA_REMOTE=1`, or without a token, the server exits with
  `Refusing to bind to non-loopback host …` / `NEXORA_REMOTE=1 requires NEXORA_TOKEN …`.
- In remote mode `GET /api/v1/auth/session` issues the session cookie only for
  `Authorization: Bearer <NEXORA_TOKEN>`, and cookies are marked `Secure` — the browser needs
  HTTPS (put a TLS reverse proxy in front).
- Hook ingest always accepts **loopback peers only**, so Claude Code must run on the same machine
  as the server.
- The Settings page shows remote mode read-only; it cannot be changed from the UI.

## Settings stored in the database

Changed from the dashboard (Settings) and audited:

- **MCP server** on/off (default off). Off ⇒ `/mcp` answers 404. See [mcp-setup.md](mcp-setup.md).
- **API tokens** for MCP clients (scope `read` or `control`).
- **Model usage consent** per project (`PUT /api/v1/projects/:id/model-consent`): whether
  model-assisted analysis/planning may run without asking each time. The default is to ask.

## Execution defaults

Per execution (New execution → configure), validated by `ExecutionConfigSchema`:

| Setting                | Default            | Limits                             |
| ---------------------- | ------------------ | ---------------------------------- |
| `maxParallelSessions`  | 4                  | 1–8                                |
| `parallelism`          | `parallel`         | `sequential`, `parallel`, `hybrid` |
| `approvalCheckpoints`  | `true`             |                                    |
| `idleTimeoutMs`        | 600 000 (10 min)   | ≥ 10 000                           |
| `turnTimeoutMs`        | 1 800 000 (30 min) | ≥ 60 000                           |
| `budgetUsd`            | none               | > 0                                |
| `modelAnalysisConsent` | `false`            |                                    |
| `runTestsOnVerify`     | `false`            |                                    |
