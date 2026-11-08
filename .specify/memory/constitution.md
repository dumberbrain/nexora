# Nexora Constitution

## Core Principles

### I. Spec-Driven Development

- Every feature MUST start as a specification (`/speckit-specify`) describing *what* and *why*,
  free of implementation detail.
- A feature MUST NOT be implemented until its spec, plan, and tasks exist and are consistent.
- Specs MUST contain testable acceptance criteria and independently deliverable user stories.

Rationale: Nexora coordinates many autonomous agents; ambiguous intent multiplies into wasted or
conflicting agent work. Written specs are the single source of truth for humans and agents alike.

### II. Human Control & Agent Safety (NON-NEGOTIABLE)

- Every agent, subagent, workflow, and MCP integration MUST run with explicitly granted,
  least-privilege permissions.
- Destructive or outward-facing actions (deleting data, force-pushing, deploying, publishing,
  spending money, sending messages) MUST require explicit human approval unless a user has
  durably pre-authorized that exact action class.
- Every running agent or workflow MUST be pausable and cancellable from the dashboard; a
  cancel MUST take effect without waiting for the task to finish.
- Secrets and credentials MUST NOT appear in prompts sent to third parties, logs, events, or UI.

Rationale: an orchestration platform amplifies mistakes across many agents at once. Humans stay
accountable, so humans keep the final say over irreversible actions.

### III. Observability & Real-Time Transparency

- Every task, agent session, tool call, and state transition MUST emit a structured event
  (timestamp, actor, task id, type, outcome).
- The dashboard MUST reflect the current state of running work; staleness MUST be visible to the
  user rather than hidden.
- An audit trail of who (human or agent) did what, and with which approval, MUST be retained and
  queryable.
- Failures MUST surface with actionable context (error, last step, affected task), never silently.

Rationale: users can only trust and steer autonomous work they can see. Monitoring is a core
product promise, not an afterthought.

### IV. Contract-Based Integrations

- Each external integration (coding agents, Claude Code sessions, skills, MCP servers) MUST sit
  behind a typed adapter interface with a documented contract.
- Adapters MUST be isolated: one failing or slow integration MUST NOT crash or block others or the
  orchestrator core.
- Contract changes MUST be versioned and covered by contract tests before release.

Rationale: the set of agents and tools changes fast. Stable contracts let Nexora add or swap
integrations without rewriting the core.

### V. Test-First Quality

- Core orchestration logic (scheduling, state machines, permission checks, event handling) MUST be
  developed test-first: tests written and failing before implementation.
- Every adapter contract and every inter-component boundary MUST have integration tests.
- CI MUST pass (lint, type-check, tests) before any merge to `main`.
- Start simple (YAGNI); added complexity MUST be justified in the plan's Complexity Tracking.

Rationale: concurrency and multi-agent coordination produce subtle bugs that manual testing misses.

## Security & Operational Constraints

- Agent workloads that execute code MUST run in an isolated workspace (e.g. git worktree,
  container, or sandbox) and MUST NOT modify files outside their assigned scope.
- Untrusted content (agent output, fetched web pages, MCP tool results) MUST be treated as data,
  never as instructions to the orchestrator.
- Credentials MUST be stored in a secret store or environment, never committed; local agent
  settings (e.g. `.claude/settings.local.json`) stay git-ignored.
- Resource limits (concurrency, timeouts, token/cost budgets) MUST be configurable per workflow,
  with safe defaults.
- Dependencies MUST be pinned to exact, maintained versions and reviewed when updated.

## Development Workflow & Quality Gates

- Flow: `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` →
  (`/speckit-analyze`) → `/speckit-implement`.
- Work happens on feature branches; direct commits to `main` are not allowed.
- Commit messages follow Conventional Commits.
- Every PR MUST be reviewed (human or agent review plus human approval) and MUST state how it
  complies with Principles I–V; deviations MUST be justified in the PR.
- The plan's Constitution Check gate MUST pass before Phase 0 research and again after design.

## Governance

- This constitution supersedes other practices; where guidance conflicts, the constitution wins.
- Amendments require a PR that updates this file, includes a Sync Impact Report, and receives
  maintainer approval.
- Versioning follows semantic versioning: MAJOR for removed or redefined principles, MINOR for new
  principles or materially expanded guidance, PATCH for clarifications and wording.
- Compliance is verified at every plan (Constitution Check) and every PR review; unjustified
  violations block merge.
- Runtime development guidance for agents lives in `CLAUDE.md` and MUST NOT contradict this file.

**Version**: 1.0.0 | **Ratified**: 2026-11-08 | **Last Amended**: 2026-11-08
