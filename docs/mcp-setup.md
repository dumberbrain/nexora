# MCP setup

Two separate things are called "MCP" in Ubuliera:

1. **Ubuliera's own MCP server** at `/mcp`, so another agent (e.g. a Claude Code session) can read
   Ubuliera's state and drive executions. Off by default.
2. **External MCP servers** that your Claude Code sessions use. Ubuliera discovers and displays
   them; it does not host or register them itself.

## 1. Ubuliera's MCP endpoint

- Transport: MCP **Streamable HTTP**, stateless, JSON responses, `POST` only
  (`GET`/`DELETE` answer 405).
- URL: `UBULIERA_PUBLIC_URL` + `/mcp` — `http://127.0.0.1:3022/mcp` by default. The Settings page
  shows the exact endpoint.
- Auth: `Authorization: Bearer <API token>`. Missing, unknown or revoked token ⇒ 401.
- Disabled ⇒ the endpoint answers 404, as if it did not exist.
- The same Host/Origin guard as the rest of the app applies (loopback names unless remote mode
  is configured, see [configuration.md](configuration.md#remote-access-opt-in)).

### Enable it and create a token

1. Open **Settings** → **MCP server** → switch **Enable MCP server** on (audited).
2. Under **API tokens** create a token: a name (letters, digits, `.`, `_`, `-`; it becomes the
   audit actor `mcp_client:<name>`) and a scope:
   - `read` — status, sessions, agents, tasks and logs only;
   - `control` — can also plan, start, pause/resume and stop executions and send agent messages.
3. Copy the secret from the dialog. It is shown **once**; Ubuliera keeps only its SHA-256 hash.
   If it is lost, revoke the token and create a new one. A revoked token's name stays reserved.

### Connect Claude Code

The token dialog shows the exact command, for example:

```bash
claude mcp add --transport http ubuliera http://127.0.0.1:3022/mcp \
  --header "Authorization: Bearer <secret>"
```

Any MCP client with Streamable HTTP support works the same way. A raw request looks like:

```bash
curl -s http://127.0.0.1:3022/mcp \
  -H "Authorization: Bearer <secret>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Tools

| Tool                                   | Scope   | Input                                               |
| -------------------------------------- | ------- | --------------------------------------------------- |
| `analyze_task`                         | read    | `{ projectId, prompt }` — creates a draft execution |
| `recommend_execution_mode`             | read    | `{ executionId }`                                   |
| `create_execution_plan`                | control | `{ executionId, mode, strategy, config? }`          |
| `start_execution`                      | control | `{ executionId }`                                   |
| `list_sessions`                        | read    | `{ status?, executionId? }`                         |
| `list_agents`                          | read    | `{ sessionId?, executionId? }`                      |
| `get_agent_status`                     | read    | `{ agentId }`                                       |
| `list_tasks`                           | read    | `{ executionId, status? }`                          |
| `get_execution_status`                 | read    | `{ executionId }`                                   |
| `send_agent_message`                   | control | `{ agentId, text }` (≤ 8 000 chars)                 |
| `pause_execution` / `resume_execution` | control | `{ executionId }`                                   |
| `stop_execution`                       | control | `{ executionId }`                                   |
| `get_execution_logs`                   | read    | `{ executionId, cursor?, limit?, severity? }`       |

Full contract: [specs/…/contracts/mcp-tools.md](../specs/001-ai-orchestration-platform/contracts/mcp-tools.md).

Rules that hold for every call:

- **Risky tasks are never approved over MCP.** `start_execution` approves the plan without any
  risky task and returns `status: "approval_required"`, the pending task ids and a dashboard
  link; a human decides in the dashboard. Approval decisions are not exposed as tools.
- `create_execution_plan` always uses the local heuristic planner (no model usage).
- `pause_execution` is "Interrupt & hold" and only works when every runtime of the execution can
  interrupt and resume; otherwise the result is `CAPABILITY_UNSUPPORTED`
  (see [limitations.md](limitations.md#no-true-pause)).
- A `read` token calling a `control` tool gets `FORBIDDEN`.
- Every call — allowed, denied, invalid or failed — is written to the audit log.
- Results are `structuredContent` JSON plus a short text; every string is passed through the
  secret redactor. Errors come back as `isError: true` with the REST error code.

API tokens authenticate **only** `/mcp` and the read-only `/live` socket. They do not open the
REST API (`/api/v1/*`), which uses the browser session cookie (or `UBULIERA_TOKEN` in remote mode).

## 2. External MCP servers (your Claude Code configuration)

Ubuliera reads, but never edits, the MCP servers Claude Code knows about:

- project scope: `<project>/.mcp.json` → `mcpServers`;
- user scope: `~/.claude.json` → `mcpServers`, and its per-project `projects.<path>.mcpServers`.

Register and edit them with Claude Code as usual, for example:

```bash
claude mcp add --transport http my-api https://example.com/mcp          # user/local scope
claude mcp add --scope project my-tool -- npx -y some-mcp-server         # writes .mcp.json
```

Then open **Skills & MCP** in Ubuliera (or press refresh). For each server you see the name,
scope, transport, command/URL (redacted), how many env vars/headers it has — **never their
values** — the permission status derived from your `permissions.allow/deny/ask` rules, and a
health status:

- `http`/`sse` servers are probed with a request to their URL;
- `stdio` servers show health `unknown`, because Ubuliera only ever spawns `claude`, `git` and
  `gh` and therefore does not start them to check.

Managed sessions started by Ubuliera load your user/project/local Claude Code settings, so the same
MCP servers are available to them. Workflow `mcp_tool` nodes call a tool through such a session;
Ubuliera does not call third-party MCP servers directly.
