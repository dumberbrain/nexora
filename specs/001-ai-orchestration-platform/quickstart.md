# Quickstart & Validation Guide

Proves the feature end-to-end. Contracts: [rest-api](contracts/rest-api.md),
[socket-events](contracts/socket-events.md), [runtime-adapter](contracts/runtime-adapter.md),
[mcp-tools](contracts/mcp-tools.md). Entities: [data-model](data-model.md).

## Prerequisites

- Node ≥ 22, npm ≥ 11, git
- Claude Code installed and logged in (`claude --version`)
- Optional: `gh` (`winget install GitHub.cli` → `gh auth login`) for GitHub view
- Optional: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` for Agent Teams mode

## Setup & run

```bash
npm install
npm run db:migrate          # creates ~/.ubuliera/ubuliera.db
npm run build && npm start  # production: http://localhost:3022
# development: npm run dev  (web 3022 → proxies API on 3023)
```

Expected: `GET http://localhost:3022/api/v1/health` → `{"status":"ok",...}`; server log states it is
bound to `127.0.0.1`.

## Validation scenarios

| # | Story | Steps | Expected |
|---|---|---|---|
| V1 | US1 | Register a sample repo, preview + confirm hook install, run `claude` there and ask it to create a file using a subagent | Session appears ≤ 2 s; canvas shows main→subagent edge; file listed under Files changed; usage shows "not available" for observed session |
| V2 | US1 | With V1 running, stop network in DevTools 60 s, restore | Missed events replayed, no duplicates (event ids unique) |
| V3 | US2 | New task "add a /health endpoint with a test" → analysis | Analysis lists stack, CLAUDE.md, skills, MCP; modes list shows Agent Teams disabled with reason if flag unset |
| V4 | US2 | Choose Subagents + TDD; generate plan; include a task marked `destructive` | Plan shows IDs, deps, owners, conflicts; destructive task not started until approved |
| V5 | US3 | During run, trigger a tool needing permission; approve one, reject one; Stop execution | Decisions recorded in audit; sessions stopped ≤ 5 s; Pause button disabled with reason |
| V6 | US4 | Drag pending task to Todo; drag running task to Completed | First accepted; second refused with message |
| V7 | US5 | Build workflow: start → (agent A ∥ agent B) → approval → end; run | Parallel nodes run together; run waits at approval; saving edits creates v2, v1 still runnable |
| V8 | US6 | With flag set, choose Agent Teams | Lead runs in terminal panel; teammates/tasks appear from hooks + team files marked best_effort |
| V9 | US7 | Open Skills & MCP, GitHub | Secrets redacted; GitHub shows setup guidance when gh missing |
| V10 | US8 | Enable MCP, create token, call `list_sessions`, then `start_execution` on plan with risky task | Results match dashboard; returns `approval_required` |
| V11 | Security | Start with `UBULIERA_HOST=0.0.0.0` without token | Server refuses to start with explanation |
| V12 | Security | Seed secrets in tool input; export logs | No secret appears in UI, export, MCP output |

## Automated checks

```bash
npm run lint && npm run typecheck
npm test               # Vitest: server unit + contract + integration, web components
npm run test:e2e       # Playwright + axe against production build on :3022
```
