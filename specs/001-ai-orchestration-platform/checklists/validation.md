# Validation: quickstart V1–V12 (T165)

**Date**: 2026-11-10 · **Platform**: Windows 10 19045, Node 22.23.2, Claude Code 2.1.322, gh logged in
**Build**: branch `001-ai-orchestration-platform` after Phase 11 merge

## How each scenario was validated

E2E specs run against the production build (`npm run build && npm run start:e2e`, `NODE_ENV=test`,
fake runtime) in chromium, firefox and webkit, with axe (WCAG 2.1 A/AA) on chromium + webkit.
Observed-session data comes from real Claude Code hook payloads recorded in spike S1
(`apps/server/tests/fixtures/hooks`); Agent Teams data from the sanitised spike S2 team files.
"Live" means a real `claude` process was driven by hand; those rows are marked when not done.

| #   | Story    | Evidence                                                                                                                                                                                                         | Result                                       |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| V1  | US1      | `e2e/us1-live-monitoring.spec.ts` (register, hook install with confirm, replay of recorded real hooks, canvas main→subagent edge, files changed, usage "not available"); load test p95 ingest→socket 137–140 ms | Pass (recorded real hooks); live run pending |
| V2  | US1      | `apps/server/tests/integration/realtime/replay.test.ts` (missed events replayed after reconnect, ids unique, no duplicates)                                                                              | Pass                                         |
| V3  | US2      | `e2e/us2-task-to-execution.spec.ts` (analysis: stack, CLAUDE.md, skills, MCP; Agent Teams disabled with reason)                                                                                                  | Pass                                         |
| V4  | US2      | `e2e/us2-task-to-execution.spec.ts` (plan ids, deps, owners, conflicts; destructive task waits for approval)                                                                                                     | Pass                                         |
| V5  | US3      | `e2e/us3-controls.spec.ts` (approve/reject recorded in audit, stop ≤ 5 s, pause disabled with reason)                                                                                                            | Pass (fake runtime)                          |
| V6  | US4      | `e2e/us4-board.spec.ts` (pending→Todo accepted; running→Completed refused with message)                                                                                                                          | Pass                                         |
| V7  | US5      | `e2e/us5-workflows.spec.ts` (parallel branches, waits at approval, save creates v2, v1 runnable)                                                                                                                 | Pass (fake runtime)                          |
| V8  | US6      | `e2e/us6-agent-teams.spec.ts` (disabled with instructions → enable; lead terminal, teammates/tasks `best_effort`); spike S2 real run in `research.md`                                                             | Pass (recorded S2); live run pending         |
| V9  | US7      | `e2e/us7-integrations.spec.ts` (secrets redacted, gh setup guidance); `secret-leak.test.ts`                                                                                                                      | Pass                                         |
| V10 | US8      | `e2e/us8-mcp.spec.ts` (enable MCP, token shown once, `list_sessions` matches dashboard, `start_execution` → `approval_required`)                                                                                 | Pass                                         |
| V11 | Security | Manual: `NEXORA_HOST=0.0.0.0` → exit 1, "Refusing to bind to non-loopback host…"; `NEXORA_REMOTE=1` + 5-char token → "NEXORA_TOKEN must be at least 32 characters."; defaults → `LISTENING 127.0.0.1:3098`     | Pass (live)                                  |
| V12 | Security | `apps/server/tests/integration/secret-leak.test.ts` (hooks, SDK stream, MCP configs → DB rows, DB files, socket, JSONL/CSV export, REST, MCP): found and fixed an AWS CLI-form key leak in the redactor         | Pass                                         |

## Automated checks (same commit)

| Check                                 | Result                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`                   | ok (contracts, server, web)                                                               |
| `npm run lint`                        | ok (`--max-warnings 0`)                                                                   |
| `npm test` (Vitest)                   | 128 files, 1062 tests passed                                                              |
| `npm run test:e2e` (Playwright)       | 141 passed on chromium, firefox, webkit (incl. a11y sweep: 13 routes × dark/light)        |
| `npm run load-test -w @nexora/server` | 10 sessions, ~987 events/min, 0 lost, p95 ingest→socket 137–140 ms (≤ 2 s, SC-001)        |
| `e2e/perf.spec.ts`                    | route navigation, open session, open board ≤ 1 s on 3 browsers (SC-007)                   |
| `/security-review` (T162)             | no findings ≥ 8/10 confidence; loopback default + remote refusal verified (V11)           |

## Open items

- V1 and V8 live runs with a real `claude` process (costs model usage) — to be done by the user.
- Axe is skipped on firefox (content-process crash, see `e2e/fixtures/axe.ts`).
- Known gaps are listed in `docs/limitations.md`.
