# Contract: Ubuliera MCP server (optional, disabled by default)

Transport: Streamable HTTP mounted on the same Hono app at `/mcp` (same process ⇒ same service
layer, FR-043). Auth: `Authorization: Bearer <token>` generated in Settings; tokens are scoped
`read` or `control`. Every call → `AuditEntry` with actor `mcp_client:<token name>`.
Input schemas = the zod schemas used by REST, converted to JSON Schema.

| Tool | Scope | Input | Maps to service |
|---|---|---|---|
| `analyze_task` | read | `{ projectId, prompt }` | `AnalysisService.analyze` (creates draft execution) |
| `recommend_execution_mode` | read | `{ executionId }` | `ModeAdvisor.options` |
| `create_execution_plan` | control | `{ executionId, mode, strategy, config? }` | `Orchestrator.plan` |
| `start_execution` | control | `{ executionId }` | `Orchestrator.requestStart` — **never** approves risky tasks; returns `approval_required` with dashboard link if any exist |
| `list_sessions` | read | `{ status?, executionId? }` | `SessionManager.list` |
| `list_agents` | read | `{ sessionId?, executionId? }` | `AgentRegistry.list` |
| `get_agent_status` | read | `{ agentId }` | `AgentRegistry.get` |
| `list_tasks` | read | `{ executionId, status? }` | `TaskManager.list` |
| `get_execution_status` | read | `{ executionId }` | `Orchestrator.status` |
| `send_agent_message` | control | `{ agentId, text ≤ 8 000 }` | `CommunicationManager.send` (capability-gated) |
| `pause_execution` / `resume_execution` | control | `{ executionId }` | capability-gated; returns `CAPABILITY_UNSUPPORTED` |
| `stop_execution` | control | `{ executionId }` | `Orchestrator.stop` |
| `get_execution_logs` | read | `{ executionId, cursor?, limit ≤ 200, severity? }` | `EventManager.query` (redacted) |

Results: `structuredContent` JSON + short text summary. Errors: `isError: true` with the REST
error code. Approval decisions are **not** exposed as MCP tools (humans decide in the dashboard).
