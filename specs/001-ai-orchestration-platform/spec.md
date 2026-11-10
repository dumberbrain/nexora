# Feature Specification: AI Development Orchestration Platform

**Feature Branch**: `001-ai-orchestration-platform`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "PROJECT: AI DEVELOPMENT ORCHESTRATOR — Build a Production-Ready
Multi-Agent Control Center. Users submit software development tasks in natural language, choose how
AI agents execute them (Multi-Session, Agent Teams, Subagents, Workflow, Hybrid), monitor execution
visually in real time at http://localhost:3022, and interact with and control agents throughout."
(Full original brief preserved in the conversation that created this spec; sections 1–14.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch real agent activity live (Priority: P1)

A developer already runs Claude Code sessions on their machine. They open the dashboard and see,
without any manual refresh, every session that is running: which directory and branch it works in,
which agents and subagents it spawned, which tools they call, which files change, and which errors
occur. They click any agent on a visual graph to open its details.

**Why this priority**: Observation of real activity is the foundation every other capability builds
on (control, planning, workflows all need trustworthy live state). It delivers value on its own:
users finally see what their agents are doing.

**Independent Test**: Start one or more Claude Code sessions in a project connected to Ubuliera, run
a task that spawns a subagent and edits a file, and confirm the dashboard shows the session, the
agent hierarchy, tool events, the changed file, and the completion — all from real data.

**Acceptance Scenarios**:

1. **Given** the dashboard is open and no session runs, **When** a user starts a Claude Code session
   in a connected project, **Then** the session appears in the Sessions view and Overview counters
   update within 2 seconds.
2. **Given** a session spawns a subagent, **When** the subagent starts and finishes, **Then** the
   Agent Canvas shows a parent→child connection, animates it on activity, and marks the child
   completed.
3. **Given** a user clicks an agent node, **When** the details panel opens, **Then** it shows role,
   current assignment, status, activity timeline, tool events, files changed, errors, and token
   usage/cost only when the runtime reported them (otherwise "not available").
4. **Given** the browser loses connection for 30 seconds, **When** it reconnects, **Then** events
   that occurred during the gap appear in order with no duplicates.
5. **Given** the Live Logs view, **When** a user filters by session, agent, event type, execution
   mode, time range, and severity and searches text, **Then** only matching events show and the
   user can export the result.

---

### User Story 2 - Submit a task and launch an approved execution plan (Priority: P1)

A developer types a task in plain language (e.g. "Build a SaaS app with auth, subscriptions, admin
dashboard and payments"). The system inspects the project (stack, project instructions, available
skills, agents, MCP servers), estimates complexity, recommends an execution mode with reasons,
asks only the relevant follow-up questions, produces a structured plan of tasks, and starts
execution only after the user approves.

**Why this priority**: This is what turns Ubuliera from a monitor into an orchestrator — the core
product promise.

**Independent Test**: Submit a task against a sample repository, verify the analysis lists the
detected stack/skills/agents/MCP servers, the recommendation names a mode with a rationale, the plan
contains tasks with dependencies and owners, and nothing executes until the user approves; then
approve and see sessions start in the monitoring views from User Story 1.

**Acceptance Scenarios**:

1. **Given** a connected project, **When** a user submits a task, **Then** the system shows an
   analysis summary (detected stack, instructions found, skills, agents, MCP servers, complexity
   estimate) before asking anything.
2. **Given** analysis is complete, **When** the mode selection screen opens, **Then** it lists only
   modes available in the current environment, marks the recommended one, explains why, and shows
   unavailable modes as disabled with the reason.
3. **Given** a mode is chosen, **When** follow-up questions are shown, **Then** only questions
   relevant to the task and mode appear (development strategy, agent configuration, skills, MCP,
   sequential/parallel, approval checkpoints), each with a recommended default.
4. **Given** a generated plan, **When** the user reviews it, **Then** every task shows ID, title,
   description, assigned agent, mode, dependencies, priority, and status, and tasks that would edit
   the same files are flagged as conflicting.
5. **Given** the plan includes a destructive, expensive, production-deployment, or major
   architectural step, **When** the user has not explicitly approved it, **Then** the step does not
   run.
6. **Given** the user approves, **When** execution starts, **Then** tasks move through statuses
   (Pending, Queued, Planning, Running, Waiting for input, Blocked, Reviewing, Completed, Failed,
   Cancelled) visible in real time.
7. **Given** execution finishes, **When** results are collected, **Then** a final verification
   summary lists completed/failed tasks, changed files, and test results.

---

### User Story 3 - Control running executions safely (Priority: P2)

While work runs, the user stops a misbehaving session, sends a message to an agent, approves or
rejects a pending approval, retries a failed task, assigns an extra task, or requests a review.
Controls the runtime cannot honour are shown as unavailable with a reason instead of pretending.

**Why this priority**: Human control is a non-negotiable principle; without it autonomous execution
is unsafe. It depends on Stories 1–2 to have something to control.

**Independent Test**: Start an execution, trigger an approval request, approve one and reject
another, stop one session, retry a failed task, and verify each action takes effect and is recorded
in the audit log; verify unsupported controls (e.g. pause in a mode that cannot pause) are disabled.

**Acceptance Scenarios**:

1. **Given** a running execution, **When** the user presses Stop, **Then** the affected sessions
   end within 5 seconds and their state shows "Stopped".
2. **Given** an agent is waiting for approval, **When** the user approves or rejects, **Then** the
   agent proceeds or aborts that action and the decision is recorded with user and timestamp.
3. **Given** the runtime of a session does not support pause, **When** the user views its controls,
   **Then** Pause is disabled with an explanation.
4. **Given** states Paused, Waiting for approval, Idle, Running, Stopped, **When** shown anywhere in
   the UI, **Then** each is visually distinct and labelled.
5. **Given** a failed task, **When** the user presses Retry, **Then** a new attempt starts and is
   linked to the previous attempt in the task history.

---

### User Story 4 - Manage tasks on a board (Priority: P2)

The user sees all tasks on a board with columns Backlog, Todo, In Progress, Review, Completed,
Failed, and drags tasks between columns when the move is valid for the task's execution state.

**Why this priority**: Gives a familiar planning surface over the plan from Story 2.

**Independent Test**: With a plan loaded, drag a not-started task from Backlog to Todo (accepted),
attempt to drag a running task to Completed (refused with a reason).

**Acceptance Scenarios**:

1. **Given** tasks in various states, **When** the board loads, **Then** each task sits in the
   column matching its status.
2. **Given** a running task, **When** the user drags it to Completed, **Then** the move is refused
   with an explanation.

---

### User Story 5 - Build and run workflows (Priority: P3)

The user builds or picks a workflow in a visual node editor (agent, skill, MCP tool, condition,
approval, parallel branch nodes), saves it as a reusable versioned template, runs it, and watches
each node's live state. Existing Claude Code skills and commands are offered as nodes only when
they can actually be executed.

**Why this priority**: Powerful for repeatable processes, but builds on the core orchestration.

**Independent Test**: Create a workflow with two parallel agent nodes, a condition, and an approval
node; run it; confirm branches run in parallel, the approval pauses execution until approved, a
retry policy re-runs a failing node, and a new saved version does not alter the running one.

**Acceptance Scenarios**:

1. **Given** a workflow with sequential and parallel steps, **When** it runs, **Then** steps run in
   the defined order/parallelism and node states update live.
2. **Given** an approval node, **When** reached, **Then** execution waits until the user decides.
3. **Given** a node fails and has a retry policy, **When** it fails, **Then** it retries per policy
   and then follows the defined error path.
4. **Given** a saved workflow, **When** the user edits and saves it, **Then** a new version is
   created and earlier versions remain runnable.

---

### User Story 6 - Use Agent Teams and Hybrid modes (Priority: P3)

When the installed Claude Code supports native Agent Teams and it is configured, the user runs a
task with a team lead and teammates and watches team tasks, messages, and each teammate's status.
In Hybrid mode the user combines mechanisms and the system explains which are used and why.

**Why this priority**: Advanced modes depend on runtime support that may not be present.

**Independent Test**: On an environment with Agent Teams enabled, run a team task and verify lead,
teammates, team task list, and teammate messages appear; on an environment without it, verify the
mode is disabled with the reason and no simulated team is created.

**Acceptance Scenarios**:

1. **Given** Agent Teams is unsupported or not configured, **When** the user opens mode selection,
   **Then** Agent Teams is disabled with what is missing and how to enable it.
2. **Given** Hybrid mode, **When** the plan is shown, **Then** each task states which mechanism
   executes it and why.

---

### User Story 7 - See integrations: skills, agents, MCP servers, GitHub (Priority: P3)

The user views installed skills, agent definitions, configured MCP servers with their tools,
integration health, and permission status, plus repository branches, commits, pull requests,
changed files, and review status — with no credentials ever displayed.

**Why this priority**: Supports planning decisions and review, but not required for core flow.

**Independent Test**: Open the Skills & MCP and GitHub views on a project with known skills, MCP
servers, and a remote repository and confirm the listed items match, health is shown, and no
secrets appear.

**Acceptance Scenarios**:

1. **Given** an MCP server configured with a secret in its settings, **When** displayed, **Then**
   the secret is redacted.
2. **Given** GitHub access is not authorized, **When** the user opens the GitHub view, **Then** it
   explains how to authorize instead of showing an error page.

---

### User Story 8 - Drive Ubuliera from another agent via MCP (Priority: P4)

The user enables Ubuliera's optional MCP server so another AI client can analyse tasks, recommend
modes, create plans, start/stop executions, list sessions/agents/tasks, send agent messages, and
read logs — subject to the same permissions and approvals as the dashboard.

**Why this priority**: Extends reach; not needed for the human-facing product.

**Independent Test**: Connect an MCP client, call list_sessions and start_execution; confirm results
match the dashboard and that a destructive action still requires human approval.

**Acceptance Scenarios**:

1. **Given** the MCP server is disabled by default, **When** the user enables it, **Then** clients
   must authenticate before calling any tool.
2. **Given** an MCP client calls start_execution with invalid input, **When** validated, **Then** it
   receives a structured error and nothing starts.

---

### Edge Cases

- Claude Code is not installed, outdated, or not authenticated → analysis and mode selection show
  the problem and how to fix it; monitoring of other sources keeps working.
- Two tasks need the same file → plan flags the conflict; execution serialises them or isolates them
  in separate workspaces; never edits the same file concurrently in one workspace.
- A session process crashes or hangs → status becomes Failed (or "unresponsive" after a timeout),
  the error is surfaced, and the user can retry or restart where supported.
- Dashboard server restarts mid-execution → after restart, persisted history reloads, still-running
  sessions are re-discovered where possible, and lost sessions are marked with an explicit
  "state unknown" rather than shown as running.
- An event source cannot provide an event type (e.g. no file-change events in a mode) → the UI
  marks that data as unavailable for that source rather than showing empty as "none".
- Event bursts (thousands of events per minute) → UI stays responsive; logs paginate.
- A secret appears in agent output or tool arguments → it is redacted before storage and display.
- The user attempts to bind the server to a non-local address without authentication → refused.
- An approval request receives no answer → the task stays "Waiting for approval" indefinitely; no
  timeout auto-approves.
- Budget/concurrency limit reached → new work queues and the user is told why.

## Requirements *(mandatory)*

### Functional Requirements

**Task intake & analysis**

- **FR-001**: Users MUST be able to submit a development task in natural language for a selected
  project directory.
- **FR-002**: System MUST analyse the project: technology stack, project instruction files (e.g.
  CLAUDE.md), available skills, commands, agent definitions, workflows, and configured MCP servers.
- **FR-003**: System MUST estimate task complexity and identify required skills/agents.
- **FR-004**: System MUST recommend an execution mode and strategy with a written rationale.
- **FR-005**: System MUST ask only follow-up questions relevant to the analysed task and chosen
  mode, each offering a recommended default.
- **FR-006**: System MUST generate a structured plan whose tasks carry: ID, title, description,
  assigned agent, execution mode, dependencies, priority, status, start time, completion time,
  changed files, and test results.
- **FR-007**: System MUST detect tasks that would modify the same files and flag them before
  execution.
- **FR-008**: Default task analysis MUST NOT consume model usage (local inspection only). Before
  any model-backed analysis or planning step, the system MUST tell the user it will consume model
  usage and obtain confirmation; a per-project "always allow" preference counts as confirmation and
  can be revoked.

**Execution modes**

- **FR-010**: System MUST support Multi-Session mode: multiple independent Claude Code sessions with
  separate contexts and responsibilities, parallel execution, lifecycle tracking, per-session logs,
  coordinator messaging between sessions, isolated workspaces where file conflicts are possible,
  and stop/resume of sessions where the runtime allows.
- **FR-011**: System MUST support Agent Teams mode using only the native capability of the installed
  Claude Code; it MUST verify support and configuration before enabling and MUST NOT emulate teams
  with ordinary subagents.
- **FR-012**: System MUST support Subagents mode: one primary session delegating to specialised
  agents (at least Architect, Frontend Developer, Backend Developer, Database Engineer, QA Engineer,
  Security Reviewer, Code Reviewer, DevOps Engineer), tracking parent-child relationships,
  completion reports, and the primary agent's review/integration step.
- **FR-013**: System MUST support Workflow mode with sequential and parallel steps, conditional
  branches, approval checkpoints, retry policies, error paths, templates, versioning, and reuse.
- **FR-014**: System MUST detect which of the user's skills/commands/workflows are executable and
  offer only those as executable steps.
- **FR-015**: System MUST support Hybrid mode combining the above plus skills and MCP tools, and
  MUST explain per task which mechanism runs it and why.
- **FR-016**: For each mode and runtime, System MUST publish its supported capabilities (e.g.
  pause, resume, message, restart, available event types) and the UI MUST derive controls and data
  availability from that declaration.

**Monitoring**

- **FR-020**: System MUST collect events from supported sources (Claude Code hooks, runtime
  output, coordinator) and normalise them into one event model recording source and reliability.
- **FR-021**: Supported event types MUST include, where the source provides them: session
  started/stopped, agent spawned/completed, task created/assigned/started/completed, tool invoked,
  file modified, permission requested, agent waiting, workflow started/completed, error occurred.
- **FR-022**: Events MUST stream to open dashboards in real time and be persisted for history;
  clients MUST be able to reconnect and retrieve missed events.
- **FR-023**: Dashboard MUST provide views: Overview, Agent Canvas, Sessions, Agent Details, Task
  Manager, Workflow Visualizer, Communication Center, Live Logs, Skills & MCP, GitHub.
- **FR-024**: Overview MUST show active sessions, active and idle agents, completed and failed tasks,
  pending approvals, running workflows, and current execution mode.
- **FR-025**: Agent Canvas MUST show agents as interactive nodes with name, type, current task,
  status, parent/child links, communication links, and task dependencies, animating links on
  activity.
- **FR-026**: Sessions view MUST show session ID, working directory, execution mode, model, current
  task, runtime status, last activity, and git branch.
- **FR-027**: Communication Center MUST show sender, receiver, timestamp, message type, related task,
  and summary of user-visible messages; it MUST NOT show private model reasoning.
- **FR-028**: Live Logs MUST filter by session, agent, event type, mode, time, and severity, support
  text search, and export.
- **FR-029**: Token usage and cost MUST be displayed only when reported by the runtime; otherwise
  shown as unavailable.

**Control**

- **FR-030**: Users MUST be able to start, stop, cancel tasks, retry failed tasks, send messages to
  agents, assign additional tasks, request reviews, approve/reject approvals, and — where the runtime
  supports it — pause, resume, and restart sessions.
- **FR-031**: Controls not supported by the underlying runtime (per the capability declaration in
  FR-016) MUST be shown as unavailable with a reason, never as operational.
- **FR-032**: States Paused, Waiting for approval, Idle, Running, and Stopped MUST be visually
  distinct.
- **FR-033**: System MUST require explicit user approval before destructive operations, expensive
  strategies, production deployments, and major architectural changes; no timeout may auto-approve.
  This applies to Ubuliera-managed executions; sessions Ubuliera only observes keep Claude Code's own
  permission settings and are labelled observe-only.
- **FR-034**: Every Ubuliera-managed session MUST run in an isolated workspace and MUST be blocked
  from writing outside its assigned scope; idle and per-turn timeouts MUST be configurable per
  execution with safe defaults, and a session exceeding them MUST be surfaced as unresponsive.

**Integrations**

- **FR-040**: System MUST list installed skills, agent definitions, MCP servers, their tools,
  integration health, and permission status.
- **FR-041**: System MUST ask the user before adding any new integration.
- **FR-042**: System MUST show repositories, branches, commits, pull requests, changed files, and
  review status through an authorised GitHub connection.
- **FR-043**: System MUST optionally expose its capabilities as an MCP server (tools: analyze_task,
  recommend_execution_mode, create_execution_plan, start_execution, list_sessions, list_agents,
  get_agent_status, list_tasks, get_execution_status, send_agent_message, pause_execution,
  resume_execution, stop_execution, get_execution_logs) using the same services, permissions, and
  approvals as the dashboard, with validated inputs and authentication.

**Security**

- **FR-050**: Dashboard MUST be served at http://localhost:3022 by default and bind to the local
  machine only; remote access MUST require explicit opt-in plus authentication.
- **FR-051**: All operations MUST pass authorisation; commands launched by the system MUST be
  limited to an allowlist; file paths MUST be validated to stay inside approved project roots.
- **FR-052**: Secrets MUST be redacted from events, logs, UI, exports, and MCP responses; no
  credentials may be hard-coded.
- **FR-053**: System MUST NOT bypass agent permission prompts by default; any permission-bypass
  option MUST be off by default and require explicit per-execution confirmation.
- **FR-054**: An audit log MUST record every control action, approval decision, and integration
  change with actor and timestamp.

**Experience**

- **FR-060**: UI MUST support dark (default) and light themes, responsive layout, real-time status
  indicators, search/filtering, notifications, and explicit loading, empty, and error states.
- **FR-061**: Production views MUST use only real data; any demo data MUST be clearly labelled as
  demo.
- **FR-062**: Every major feature MUST either work end-to-end or display an explicit, documented
  limitation.
- **FR-063**: System MUST ship documentation: installation, configuration, runtime setup, MCP setup,
  usage examples, troubleshooting.

### Key Entities *(include if feature involves data)*

- **Project**: a local repository root Ubuliera may act in; holds detected stack, instructions,
  integrations.
- **Execution**: one run of a user task; mode, strategy, configuration answers, plan, status,
  approvals, final verification summary.
- **Plan / Task**: units of work with ID, title, description, owner agent, mode, dependencies,
  priority, status, times, changed files, test results, attempt history.
- **Session**: one Claude Code runtime instance; ID, working directory, branch, model, mode, status,
  last activity, capabilities.
- **Agent**: a lead, teammate, subagent, or session-level agent; role, type, parent, children,
  status, assignments.
- **Event**: normalised record of something that happened; type, time, source, reliability,
  session/agent/task links, severity, redacted payload.
- **Message**: user-visible communication between agents, coordinator, or user; sender, receiver,
  type, related task, summary.
- **Approval Request**: an action awaiting a human decision; requester, action, risk class,
  decision, decider, time.
- **Workflow / Workflow Version**: reusable graph of nodes (agent, skill, MCP tool, condition,
  approval, parallel) with versions and runs.
- **Integration**: skill, command, agent definition, MCP server, or GitHub connection; health,
  permission status, executable flag.
- **Runtime Capability Profile**: what a mode/runtime supports (controls, event types).
- **Audit Entry**: actor, action, target, outcome, time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Activity in a connected Claude Code session appears on the dashboard within 2 seconds
  in 95% of cases.
- **SC-002**: A user goes from submitting a task to an approved, running execution in under
  5 minutes for a feature-sized task such as "add a /health endpoint with a test" (quickstart V3).
- **SC-003**: 100% of destructive, expensive, deployment, and major architectural actions in test
  scenarios are blocked until explicitly approved.
- **SC-004**: 0 secrets appear in UI, logs, exports, or MCP responses in a test suite seeded with
  known secret patterns.
- **SC-005**: 100% of controls shown as enabled succeed when used; every unsupported control is
  disabled with a reason.
- **SC-006**: After a 60-second disconnect, the dashboard recovers all missed events with no loss or
  duplication.
- **SC-007**: Dashboard stays responsive (interactions respond within 1 second) while handling at
  least 10 concurrent sessions and 1,000 events per minute.
- **SC-008**: In parallel executions, 0 cases of two agents writing the same file in the same
  workspace concurrently.
- **SC-009**: A new user installs and sees their first live session within 15 minutes using only
  the documentation.
- **SC-010**: Every major feature listed in this spec is either demonstrably working or listed in
  the documented limitations — no undocumented placeholders.

## Assumptions

- Single local user on their own machine is the primary audience for v1; multi-user teams and
  hosted deployment are out of scope. Remote access is an opt-in mode protected by authentication.
- Claude Code (detected: 2.1.319) is installed and authenticated by the user; Ubuliera does not
  manage Anthropic accounts or billing.
- Agent Teams availability depends on the installed Claude Code version and configuration and is
  detected at runtime; it may be unavailable on some machines.
- Capabilities such as pause/resume differ per runtime; only documented runtime features are used.
- GitHub data requires an authorised connection; GitHub CLI is currently not installed on the
  target machine, so the GitHub view starts in "not connected" state with setup guidance.
- Event history retention defaults to 30 days locally, configurable.
- Cost and concurrency limits have safe defaults (e.g. at most 4 parallel sessions) and are
  configurable per execution.
- The technology choices stated in the brief (frontend, backend, persistence, testing stack) are
  binding inputs for `/speckit-plan`; they are intentionally kept out of this specification.
- Delivery is phased (Foundation → Dashboard → Claude Integration → Execution Modes → Advanced
  Features → Reliability → Documentation); each phase is implemented only after user approval.
