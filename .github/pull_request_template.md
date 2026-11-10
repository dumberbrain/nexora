## What & why

<!-- One paragraph: what changes and which spec task(s) / user story it delivers (e.g. T057, US1). -->

## Constitution compliance (`.specify/memory/constitution.md` v2.0.0)

- [ ] **I. Spec-Driven** — change traces to spec/plan/tasks; tasks marked `[X]`
- [ ] **II. Human Control & Agent Safety** — no new auto-approval path; controls capability-gated; Ubuliera-started work stoppable; secrets never logged/emitted/exported
- [ ] **III. Observability** — state changes emit structured events; failures surfaced, not swallowed
- [ ] **IV. Contract-Based Integrations** — adapters behind typed contracts; contract tests updated; `packages/contracts` changes reviewed by its owner
- [ ] **V. Test-First Quality** — tests written first for core logic; CI green

## Security constraints

- [ ] Agent work isolated (worktree) and scope-guarded
- [ ] Untrusted content (agent output, hook payloads, MCP results) treated as data
- [ ] No hard-coded credentials; dependencies pinned to exact versions

## Verification

<!-- Paste the real output: npm run lint / typecheck / test (and test:e2e if touched). -->

## Limitations / deviations

<!-- Anything not working end-to-end must be listed here and in docs/limitations.md. Write "none" if none. -->
