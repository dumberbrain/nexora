# Usage examples

All examples assume Ubuliera runs on <http://localhost:3022> (see [installation.md](installation.md)).
UI labels are quoted in **bold**.

## 1. Watch a Claude Code session you started yourself

1. **Overview** → **Register project** → path of a local repo (e.g. `C:\work\demo-repo`).
2. On the project row: **Install hooks** → review the preview → confirm.
3. In a terminal: `cd C:\work\demo-repo && claude`, then ask for something that uses a subagent,
   e.g. _"Use a general-purpose subagent to create hello.txt containing hi"_.
4. In Ubuliera:
   - **Sessions** lists the session with an **observe-only** badge;
   - **Canvas** draws `main → general-purpose`; click a node for the agent details panel (tools,
     files changed, last output);
   - **Logs** streams events live; search, filter by type/severity/time, and export the filtered
     result as JSONL or CSV.

Usage and cost show "not available" for observed sessions: hooks do not report them.

## 2. Turn a task into a managed execution

1. **Overview** → **+ new execution**.
2. Pick the project, describe the task (e.g. _"add a /health endpoint with a test"_) →
   **Analyse task**. The local analysis lists the detected stack, instruction files, skills,
   agents and MCP servers, and a complexity estimate — no model usage.
3. Choose a mode (Multi-Session, Agent Teams, Subagents, Workflow, Hybrid) and a strategy
   (spec-driven, plan-first, TDD, direct, research-first) → **Use this mode**. Modes that cannot
   run here are disabled with the reason (e.g. Agent Teams without the flag).
4. Answer the follow-up questions (parallelism, max parallel sessions, approval checkpoints,
   budget …).
5. **Generate plan**. With **Model-assisted planning** off you get a local heuristic plan; on, Claude
   drafts it after you consent to the model usage. The plan shows task ids, dependencies, owners,
   owned paths and conflicts (serialised or separate worktrees).
6. Tick the risky tasks you approve now (destructive, deployment, expensive, architectural) and
   **Approve & start**. Unticked risky tasks wait in the **Approvals inbox**.
7. The execution page shows task statuses, sessions, the approvals inbox, controls and, at the
   end, a verification summary.

The same flow over REST (cookie + CSRF header from `GET /api/v1/auth/session`):

```http
POST /api/v1/executions                  { "projectId": "<id>", "prompt": "add a /health endpoint" }
POST /api/v1/executions/<id>/analysis
PUT  /api/v1/executions/<id>/mode        { "mode": "multi_session", "strategy": "plan_first" }
PUT  /api/v1/executions/<id>/config      { "config": { "maxParallelSessions": 2 } }
POST /api/v1/executions/<id>/plan        { "modelAssisted": false }
POST /api/v1/executions/<id>/approve     { "approveRiskyTaskIds": [] }
```

Managed work runs in `<repo>/.ubuliera/worktrees/<execution>/…` on `ubuliera/<execution>` branches —
your checkout is not touched and nothing is pushed.

## 3. Approve, reject and stop

- Permission requests and risky tasks appear in the **Approvals inbox** (execution page) and as a
  toast. **Approve** or **Reject**; both are audited. Nothing is ever auto-approved and approvals
  do not time out — a request only expires (as a denial) when its session, run or execution is
  stopped.
- **Stop** (execution toolbar) asks for confirmation, then stops every session of the execution.
- **Interrupt & hold** interrupts the current turn and holds the execution; **Resume** continues
  it. It is disabled, with the reason, when a runtime cannot do it — see
  [limitations.md](limitations.md#no-true-pause).
- Per session (**Sessions** → a session): **Stop**, **Interrupt & hold**, **Resume**,
  **Restart**, and a message box to the main agent, each enabled only if the runtime supports it.

## 4. Task board

**Tasks** shows a Kanban board per execution (Backlog, Todo, In Progress, Review, Completed, Failed).
Drag a card — or use the keyboard: focus a card, **Space** to pick it up, arrow keys to move,
**Space** to drop. Only Backlog ↔ Todo moves are user moves; a running card cannot be dragged and
says why. The server re-checks every move (`PATCH …/tasks/:taskId/status`) and refuses invalid
transitions with `409 CONFLICT`.

## 5. Workflows

1. **Workflows** → start from a built-in template or **Create workflow**.
2. In the editor add nodes (agent, skill, MCP tool, condition, approval, parallel fork / join),
   connect them in the canvas or with the keyboard-friendly **Node inspector**
   (**Selected node**, **Connect to**, **Add connection**).
3. The status line says **Graph is valid** or lists problems. **Save as new version** — earlier
   versions stay runnable.
4. **Run version N** → choose a project → **Start run**. Parallel branches run together; an
   approval node waits for your decision.

## 6. Agent Teams

With `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (see [runtime-setup.md](runtime-setup.md#agent-teams))
choose **Agent Teams** on New execution. Ubuliera starts the lead in a terminal you can see and type
into (agent details panel of the lead). Teammates and their tasks appear from hooks and team files
(marked best effort). Messages go to the lead only.

## 7. Skills, MCP and GitHub

- **Skills & MCP** lists skills, commands, agents and MCP servers from your user and project
  Claude Code configuration with scope, health and permission status. Secrets are never shown —
  only how many env vars/headers a server has.
- **GitHub** shows branches, commits and pull requests (with changed files) of registered
  projects that have a github.com remote, read-only through `gh`. Without `gh` it shows setup
  steps.

## 8. Drive Ubuliera from another agent (MCP)

Enable the MCP server and create a token in **Settings**, then:

```bash
claude mcp add --transport http ubuliera http://127.0.0.1:3022/mcp --header "Authorization: Bearer <secret>"
```

In that Claude Code session: _"Use the ubuliera tools to list my sessions"_ or _"plan and start
execution &lt;id&gt; in multi_session mode"_. Risky tasks come back as `approval_required` with a
dashboard link. Details: [mcp-setup.md](mcp-setup.md).

## 9. Measure performance

```bash
# against a running server (production or dev); add --duration/--sessions/--rate to change load
npm run load-test --workspace @ubuliera/server -- --url http://127.0.0.1:3022
```

Drives 10 synthetic sessions at 1 000 events/min through the real hook ingest endpoint and
reports ingest → dashboard-socket latency (p50/p95/max). It exits non-zero when p95 > 2 s or any
event is lost. It registers a throw-away project, so point it at a scratch data dir if you want
to keep your history clean. `e2e/perf.spec.ts` checks that navigation, opening a session and the
task board each take ≤ 1 s.
