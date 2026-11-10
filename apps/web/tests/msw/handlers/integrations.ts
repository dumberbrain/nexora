import { type IntegrationItem, type IntegrationList } from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 10, 9, 0, 0);
const P1 = "01JCXK0000000000000000P001";

const base = {
  projectId: P1,
  sourcePath: null,
  executable: false,
  health: "unknown",
  permissionStatus: "allowed",
  metadata: {},
  discoveredAt: NOW,
  description: null,
  tools: [],
  healthDetail: null,
  checkedAt: null,
} satisfies Omit<IntegrationItem, "id" | "kind" | "name" | "scope">;

/** Skills, commands, agents and MCP servers of project P001 (secrets already redacted). */
export const integrationFixtures: IntegrationItem[] = [
  {
    ...base,
    id: "01JCXK0000000000000000N001",
    kind: "skill",
    name: "speckit-plan",
    scope: "project",
    sourcePath: ".claude/skills/speckit-plan/SKILL.md",
    executable: true,
    health: "ok",
    description: "Generate the implementation plan",
  },
  {
    ...base,
    id: "01JCXK0000000000000000N002",
    kind: "command",
    name: "review",
    scope: "user",
    executable: false,
    health: "ok",
    permissionStatus: "ask",
  },
  {
    ...base,
    id: "01JCXK0000000000000000N003",
    kind: "agent_definition",
    name: "code-reviewer",
    scope: "plugin",
    health: "ok",
    description: "Reviews diffs",
    metadata: { tools: ["Read", "Grep"], model: "sonnet" },
  },
  {
    ...base,
    id: "01JCXK0000000000000000N004",
    kind: "mcp_server",
    name: "playwright",
    scope: "project",
    health: "ok",
    checkedAt: NOW,
    metadata: {
      transport: "stdio",
      command: "npx",
      envKeys: ["PLAYWRIGHT_TOKEN"],
      authorization: "[REDACTED]",
    },
    tools: [
      { name: "browser_click", description: "Click an element", permissionStatus: "allowed" },
      { name: "browser_navigate", description: null, permissionStatus: "ask" },
    ],
  },
  {
    ...base,
    id: "01JCXK0000000000000000N005",
    kind: "mcp_server",
    name: "remote-docs",
    scope: "user",
    health: "down",
    healthDetail: "timed out after 5 s",
    permissionStatus: "needs_auth",
    checkedAt: NOW,
    metadata: { transport: "http", headerKeys: ["X-Api-Key"] },
  },
];

/** What a forced re-discovery returns: remote-docs is reachable again. */
export const refreshedIntegrationFixtures: IntegrationItem[] = integrationFixtures.map((i) =>
  i.name === "remote-docs"
    ? { ...i, health: "degraded", healthDetail: "slow handshake (4.2 s)", checkedAt: NOW + 60_000 }
    : i,
);

export const INTEGRATIONS_DISCOVERED_AT = NOW;

export const integrationHandlers = [
  http.get("*/api/v1/integrations", ({ request }) => {
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "true";
    const projectId = url.searchParams.get("projectId");
    const source = refresh ? refreshedIntegrationFixtures : integrationFixtures;
    const items = projectId ? source.filter((i) => i.projectId === projectId) : source;
    return HttpResponse.json<IntegrationList>({
      items,
      discoveredAt: refresh ? NOW + 60_000 : NOW,
    });
  }),
];
