# Troubleshooting

Start with the server log (JSON lines on stdout; raise detail with `NEXORA_LOG_LEVEL=debug`) and
`GET /api/v1/health` / `GET /api/v1/runtime/environment`.

## The server does not start

| Message                                                                      | Cause and fix                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Refusing to bind to non-loopback host "…"`                                  | `NEXORA_HOST` is not loopback. Unset it, or opt in with `NEXORA_REMOTE=1` + `NEXORA_TOKEN` ([configuration.md](configuration.md#remote-access-opt-in)). |
| `NEXORA_REMOTE=1 requires NEXORA_TOKEN …` / `must be at least 32 characters` | Set a random token of ≥ 32 characters.                                                                                                                  |
| `NEXORA_TEST_FAKE_RUNTIME=1 is only allowed with NODE_ENV=test`              | Remove the variable; it exists only for the E2E suite.                                                                                                  |
| `Invalid configuration — NEXORA_PORT: …`                                     | A variable has the wrong format (port 1–65535, `NEXORA_PUBLIC_URL` a full URL, `NEXORA_REMOTE` `0`/`1`).                                                |
| `EADDRINUSE … 3022` (or 3023)                                                | Another process owns the port — often a second Nexora or `npm run dev`. Stop it or set `NEXORA_PORT`.                                                   |
| `web build not found — run npm run build; API still available`               | Production mode without `apps/web/dist`. Run `npm run build`.                                                                                           |
| npm refuses to install (`EBADENGINE`)                                        | Node < 22.12 or npm < 11; `engine-strict` is on. Upgrade Node (see `.nvmrc`).                                                                           |

## The dashboard

- **Blank page or `Host not allowed` / `Cross-origin request rejected` (403)** — open the app as
  `http://localhost:<port>` or `http://127.0.0.1:<port>` on Nexora's own port or 3022. Other
  hostnames (LAN IP, custom names) are rejected in loopback mode by design (DNS-rebinding
  protection).
- **Header says "reconnecting" / "offline"** — the realtime socket lost the server. After a
  server restart the session cookie is invalid; the app fetches a new one automatically. Missed
  events (up to 5 000) are replayed on reconnect; beyond that lists are refetched.
- **401 after restarting the server** — reload the page; session secrets are per process.
- **Data looks stale** — rows show a stale marker when the socket is down or a session has been
  silent for long; check the connection indicator first.

## Observed sessions do not appear

1. The project must be registered **and** hooks installed (project row says hooks installed).
   Check `<project>/.claude/settings.local.json` contains `http` hooks whose URL ends in
   `/api/v1/hooks/ingest` and an `X-Nexora-Hook-Token` header.
2. Claude Code reads settings at start — restart `claude` after installing hooks.
3. The hook URL must reach the server: by default `http://127.0.0.1:3022`. In `npm run dev` the web
   dev server on 3022 must be running (it proxies to 3023). If you changed the port, set
   `NEXORA_PUBLIC_URL` and reinstall the hooks.
4. Hook ingest accepts loopback peers only — Claude Code must run on the same machine.
5. `401 Missing or invalid X-Nexora-Hook-Token`: the token in the settings file is from an older
   install or another data dir; reinstall hooks.
6. The session appears with its **first** event: Claude Code does not send `SessionStart` to
   `http` hooks, so an idle `claude` you have not prompted yet is not visible.

## Claude Code / runtimes

- **"Claude Code CLI not found"** — `claude` is not on the `PATH` of the shell that started Nexora
  (on Windows also checked: `%USERPROFILE%\.local\bin\claude.exe`). Open a new terminal after
  installing, or start Nexora from a shell where `claude --version` works.
- **"Claude Code is not logged in — run `claude auth login`"** — log in, then reload New
  execution.
- **"Could not determine the login state"** — `claude auth status` failed or printed something
  unexpected; managed sessions may still work. Run it yourself to see why.
- **A managed session hangs at the start** — check the execution's approvals inbox: every shell
  command and every out-of-scope tool call needs your approval.
- **Session `unresponsive` / turn timed out** — during a turn, a managed session with no event for
  `idleTimeoutMs` (10 min) is marked `unresponsive`; a turn longer than `turnTimeoutMs` (30 min)
  is interrupted (or stopped when the runtime cannot interrupt). Both timers pause while an
  approval is pending. Raise them in the execution config.

## Agent Teams

- **Mode disabled: "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 …"** — see
  [runtime-setup.md](runtime-setup.md#agent-teams); restart Nexora if you set it in the
  environment.
- **"node-pty could not be loaded …"** — the native module did not load. Run `npm ci` again; on
  Windows make sure `node-pty` is `1.1.0` (prebuilt); elsewhere install a C++ toolchain. Until
  then, start the lead yourself and observe it.
- **The lead never starts working** — it is probably waiting at Claude Code's workspace-trust
  prompt. Open the lead's terminal (agent details panel) and answer it; Nexora never accepts it
  for you.
- **PTY spawn hangs on Windows** — Nexora was started without a console (e.g. from a GUI or
  console-less Git Bash). Start it from PowerShell / Windows Terminal.
- **Stopping the lead** uses `taskkill /T /F` on Windows (`pty.kill()` fails there with
  `AttachConsole failed`).

## GitHub view

- **Status `not installed`** (hint `winget install --id GitHub.cli -e`) — install `gh` ([setup/prerequisites.md](setup/prerequisites.md)),
  open a new terminal, restart Nexora so it sees the new `PATH`, then **Check again**.
- **Status `not authenticated`** — run `gh auth login`; `gh auth status` must say "Logged in to
  github.com".
- **No repositories** — only registered projects whose git remote points at github.com are listed.

## MCP endpoint

- `404` on `/mcp` — the MCP server is disabled; enable it in Settings.
- `401` — missing, wrong or revoked token; the header must be `Authorization: Bearer <secret>`.
- `405` — use `POST` (the endpoint is stateless; no GET stream).
- `FORBIDDEN … requires a control token` — create a `control` token for that tool.
- `CAPABILITY_UNSUPPORTED` on `pause_execution` — a runtime of that execution cannot interrupt +
  resume ([limitations.md](limitations.md#no-true-pause)).
- `A token named "…" already exists` — names stay reserved after revoke; pick another name.

## Performance

Measure with the load test (see [usage-examples.md](usage-examples.md#9-measure-performance)). A
reference run on Windows 10 (dev server, 10 sessions, 1 000 events/min, 60 s) gave ingest →
socket p50 ≈ 115 ms, p95 ≈ 140 ms, max ≈ 200 ms with no lost events. If your numbers are much
worse, check `NEXORA_LOG_LEVEL` (debug logging is costly) and antivirus scanning of the data dir.

## Tests on Windows

- Use the Bash tool / Git Bash or PowerShell 7 for scripts; **never** rewrite text files with
  Windows PowerShell 5.1 `Get-Content`/`Set-Content` — it re-encodes UTF-8 as cp1252.
- `npm run test:e2e` builds and starts its own server on 3022; stop `npm start`/`npm run dev` first
  or set `NEXORA_E2E_PORT`.
- Some worktree/E2E tests can be flaky under heavy parallel load on Windows (file handles held
  briefly, `EBUSY`); rerun before investigating.
