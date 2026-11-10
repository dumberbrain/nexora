# Limitations

Ubuliera uses only documented Claude Code interfaces (hooks, the Agent SDK, headless CLI, the
interactive CLI for Agent Teams, team files read-only). Where those interfaces cannot do
something, Ubuliera shows the control as unavailable with the reason instead of faking it. This
page lists those limits, plus known gaps of the current version.

## Controls per runtime

| Control                | Agent SDK (`agent_sdk`) | Headless CLI (`cli_headless`) | Agent Teams lead (`agent_team_pty`) | Observed (`external_observed`) |
| ---------------------- | ----------------------- | ----------------------------- | ----------------------------------- | ------------------------------ |
| Start                  | ✔                       | ✔                             | ✔                                   | ✘ (you start it)               |
| Stop                   | ✔                       | ✔                             | ✔                                   | ✘                              |
| Interrupt              | ✔                       | ✘                             | ✔ (Ctrl-C to the lead)              | ✘                              |
| Pause                  | ✘                       | ✘                             | ✘                                   | ✘                              |
| Resume                 | ✔                       | ✔                             | ✘                                   | ✘                              |
| Restart                | ✔                       | ✘                             | ✘                                   | ✘                              |
| Send message           | ✔                       | ✔                             | lead only                           | ✘                              |
| Change permission mode | ✔                       | ✘                             | ✘                                   | ✘                              |
| Usage / cost           | estimate                | estimate                      | none                                | none                           |

Source of truth: `apps/server/src/modules/runtime-manager/capabilities.ts` and
`apps/server/src/modules/session-manager/capabilities.ts` (`GET /api/v1/sessions/:id` returns the
profile; the UI derives every button from it).

## No true pause

Claude Code has no documented pause. What the UI calls **Interrupt & hold** (API and MCP name:
`pause`, `POST /executions/:id/pause`, `pause_execution`) is:

1. interrupt every running turn of the execution, then
2. mark the execution `paused`;

**Resume** continues each session by its session id (a new SDK query with `resume`), sending a
short "continue" message. Work in flight when you held it is interrupted, not frozen. The control
is offered only when **every** runtime of the execution supports interrupt + resume; otherwise
it is disabled with the reason and the API/MCP returns `CAPABILITY_UNSUPPORTED`.

## Observed sessions are observe-only

Sessions you start yourself are seen through hooks. Ubuliera cannot stop, interrupt, resume or
message them, and always answers hooks with `{}` (no decisions). Also:

- they appear with their first event (`SessionStart` is not delivered to `http` hooks);
- token usage and cost are not available;
- subagent → parent links are derived from the latest `Agent` tool call (reliability `derived`);
  after a server restart an orphaned subagent is attached to the main agent;
- worktree activity is not captured (Ubuliera does not hook `WorktreeCreate/Remove`).

## Agent Teams

- Experimental Claude Code feature; requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and
  `node-pty`. Never emulated with subagents.
- **Messaging is lead-only**: Ubuliera types into the lead's terminal (best effort). Individual
  teammates cannot be messaged, paused or resumed — there is no documented external API.
- Team members, tasks and inbox messages come from polling `~/.claude/teams/<team>/` and
  `~/.claude/tasks/<team>/` — **best effort**: inboxes are emptied within seconds once read, so
  some messages are never seen. Ubuliera never writes these files.
- The lead cannot be resumed; the terminal and team view of a lead are lost when the Ubuliera
  server restarts.
- Task scopes (`ownedPaths`) are advisory for a team; the scope guard that checks managed SDK
  sessions does not apply to the interactive lead.
- The same teammate can show up twice on the canvas (once from hooks, once from team files).
- Workspace-trust and "new MCP server" prompts must be answered by you in the terminal.

## Cost and usage

- Cost is Claude Code's own **client-side estimate** (`total_cost_usd`, cumulative per session)
  and is labelled "≈ estimated". It is not a bill.
- Token totals are summed from `modelUsage`. Runtimes that do not report usage show "not
  available" — never a zero.

## Approvals and safety

- Approvals never auto-approve and never time out; a pending request only expires (as a denial)
  when its session, run or execution is stopped.
- Shell tools (Bash, PowerShell) always need an approval in managed sessions.
- MCP clients cannot approve anything; `start_execution` returns `approval_required`.
- Remote access is opt-in and token-protected, but there is no TLS in Ubuliera itself — use a
  reverse proxy; never expose the port directly.

## Known gaps in this version

- **After a server restart** Ubuliera cannot re-attach to processes it started: sessions that were
  starting, running, idle, waiting for approval, paused or unresponsive are marked `unknown` (history
  is kept). A session goes back to `running` when its next hook event arrives.
- **Event retention** deletes events older than `UBULIERA_RETENTION_DAYS` (default 30) at boot and every
  6 hours. Error events and approval events are kept; audit entries are never deleted.
- Execution prompts are stored as typed (unredacted), because the agent needs the full text — do not
  paste secrets into a task prompt.
- API tokens authenticate only `/mcp` and the `/live` socket, not the REST API (there are no
  per-scope REST checks). There is no audit-log viewer yet (entries are in the database).
- Token names stay reserved after revoke.
- `analyze_task` (read scope) creates a draft execution.
- Task worktrees for conflicting parallel tasks are not merged back automatically; branches are
  kept (`ubuliera/<execution>` and `ubuliera/<execution>--<task>`) and nothing is pushed.
- The verifier reports test results only when test output is available; `runTestsOnVerify` does
  not run the project's tests yet.
- Retrying a failed task does not revive tasks that depended on it.
- For the headless CLI runtime, the scope guard can only react after a tool call has been
  reported (the CLI has no in-process permission callback).
- The message feed has no "load older" paging.
- `stdio` MCP servers always show health `unknown`, and their tools are not listed (Ubuliera does
  not spawn them). An `http` MCP probe that gets `401` counts as reachable.
- Permission status of skills/agents is inferred from the `permissions` rule syntax.
- Session status has no `waiting_for_input` state; tasks do not record their session id.
- Firefox: the axe accessibility check is skipped in the E2E suite (axe crashes the Firefox
  content process); the specs themselves run there.
- Some worktree and E2E tests can be flaky under heavy parallel load on Windows.
- Single user: there are no accounts or roles.
