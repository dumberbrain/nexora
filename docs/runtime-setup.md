# Runtime setup

Nexora does not talk to models directly. It drives and observes **Claude Code** through its
documented interfaces only. This page explains what each runtime needs on your machine.

Check the current state any time on **New execution** (modes list) or via
`GET /api/v1/runtime/environment`, which reports the Claude Code version, login state, the Agent
Teams flag and which runtimes are available.

## Runtimes at a glance

| Runtime             | Used for                                                                                                                              | Needs                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `agent_sdk`         | default for managed sessions (Multi-Session, Subagents, Workflow nodes, Hybrid)                                                       | `@anthropic-ai/claude-agent-sdk` (bundled) + Claude Code login |
| `cli_headless`      | managed sessions through the installed `claude` binary (`claude -p --input-format stream-json --output-format stream-json --verbose`) | `claude` on `PATH` + login                                     |
| `agent_team_pty`    | Agent Teams lead, interactive `claude` in a pseudo-terminal                                                                           | `node-pty`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`           |
| `external_observed` | sessions you start yourself, seen through hooks                                                                                       | hooks installed in the project                                 |

What each runtime can and cannot do (stop, interrupt, resume, message …) is listed in
[limitations.md](limitations.md#controls-per-runtime).

## Claude Code

1. Install Claude Code and make sure `claude --version` works in the shell that starts Nexora.
   Nexora looks for `claude` on `PATH`; on Windows it also tries `%USERPROFILE%\.local\bin\claude.exe`.
2. Log in once: `claude auth login` (or run `claude` and follow the prompt).
   Nexora checks with `claude auth status`; it never spends model usage to find out.
3. If `ANTHROPIC_API_KEY` is set in Nexora's environment, Nexora treats Claude Code as
   authenticated.

Managed sessions load your normal Claude Code settings (`settingSources: user, project, local`),
so project `CLAUDE.md`, skills, agents and MCP servers apply as they would in the terminal.
The permission mode is `default` while the execution's approval checkpoints are on (the
default) and `acceptEdits` when you turn them off. `bypassPermissions` is never a default: it is
set only when you approve a plan with permission bypass and type `bypass permissions` to confirm,
and that approval is recorded in the audit log.

Nexora only ever spawns `claude`, `git` and `gh`, with argument arrays and no shell.

## Observing your own sessions (hooks)

To see sessions you start in a terminal, register the project and install hooks (Overview →
**Register project** → **Install hooks**). The installer:

- shows a preview first and writes nothing until you confirm;
- merges one `http` hook per event into `<project>/.claude/settings.local.json`, keeping every
  other setting and hook;
- sends a per-project secret in the `X-Nexora-Hook-Token` header (only its SHA-256 is stored);
- registers `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
  `PermissionRequest`, `PermissionDenied`, `Notification`, `SubagentStart`, `SubagentStop`,
  `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `Stop`, `StopFailure`, `SessionEnd`,
  `CwdChanged`;
- deliberately skips `WorktreeCreate` / `WorktreeRemove` (a hook there would replace Claude
  Code's own worktree handling).

Nexora always answers hooks with `{}` — it never steers an observed session.

The hook URL is `NEXORA_PUBLIC_URL` + `/api/v1/hooks/ingest`. If you change the port, reinstall
the hooks so the URL is updated.

## Agent Teams

Agent Teams is an experimental Claude Code feature. Nexora runs it natively — never emulated
with subagents — so it needs both of these:

### The flag

Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in any of:

- the environment of the Nexora server process;
- `~/.claude/settings.json` → `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }`;
- a registered project's `.claude/settings.json` or `.claude/settings.local.json` `env`.

Or let Nexora write it: on New execution the disabled Agent Teams option offers to enable it for
the project. You must type `enable agent teams` to confirm; Nexora then sets the flag in that
project's `.claude/settings.local.json` and records the change in the audit log
(`POST /api/v1/runtime/agent-teams/enable`).

### node-pty

Teams are not available in headless (`-p`) or SDK sessions, so Nexora starts the team lead as an
interactive `claude` inside a pseudo-terminal using `node-pty@1.1.0`, and shows that terminal in
the lead's agent details panel so you can answer prompts there.

- Windows: `node-pty@1.1.0` ships a `win32-x64` prebuild (1.0.0 did not). ConPTY needs a console:
  start Nexora from a normal terminal window (PowerShell, Windows Terminal, cmd). Under a
  console-less parent the PTY spawn can hang.
- macOS / Linux: prebuilds are used when available; otherwise npm compiles it, which needs a C++
  toolchain (Xcode CLT / build-essential + Python).
- If `node-pty` cannot load, Nexora still runs: Agent Teams becomes **observe-only** — start the
  lead yourself in a terminal with the flag set and Nexora follows it through hooks.

### What to expect

- On first start in a new folder, Claude Code asks whether you trust the workspace (default
  answer "No, exit"). Nexora never auto-accepts it: answer in the terminal panel. The session
  waits until you do.
- Teammates appear from `SubagentStart/Stop` and `TeammateIdle` hooks plus read-only polling of
  `~/.claude/teams/<team>/` files (reliability `best_effort`). Nexora never writes those files.
- Messages go to the **lead only** (typed into its terminal).

## GitHub CLI

The GitHub view reads data only through `gh api` (GET requests) and `gh auth status`.
Install and authenticate as described in [setup/prerequisites.md](setup/prerequisites.md), then
click **Check again** on the GitHub page. Without `gh` the page shows setup guidance; branches and
commits of local repositories still come from `git`.
