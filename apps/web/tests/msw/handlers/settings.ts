import {
  ApiTokenSchema,
  CreateApiTokenInputSchema,
  UpdateMcpSettingsInputSchema,
  type ApiToken,
  type CreateApiTokenResult,
  type Settings,
} from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 10, 9, 0, 0);

export const MCP_ENDPOINT = "http://127.0.0.1:3021/mcp";

/** Fixed secret the fake server "generates" — the real server returns 32+ random bytes. */
export const CREATED_TOKEN_SECRET = "nxr_" + "s3cr3t".repeat(8);

export const settingsFixture: Settings = {
  mcp: { enabled: false, endpoint: MCP_ENDPOINT },
  remote: { enabled: false, host: "127.0.0.1", port: 3021, envTokenConfigured: false },
};

export const apiTokenFixtures: ApiToken[] = [
  {
    id: "01JCXK0000000000000000K002",
    name: "claude-desktop",
    scope: "control",
    createdAt: NOW - 2 * 86_400_000,
    lastUsedAt: NOW - 3_600_000,
    revokedAt: null,
  },
  {
    id: "01JCXK0000000000000000K001",
    name: "old-ci",
    scope: "read",
    createdAt: NOW - 9 * 86_400_000,
    lastUsedAt: null,
    revokedAt: NOW - 86_400_000,
  },
];

let settings: Settings = structuredClone(settingsFixture);
let tokens: ApiToken[] = structuredClone(apiTokenFixtures);
let seq = 10;

/** Reset the in-memory settings + token store between tests. */
export function resetSettings(): void {
  settings = structuredClone(settingsFixture);
  tokens = structuredClone(apiTokenFixtures);
  seq = 10;
}

const notFound = () =>
  HttpResponse.json({ error: { code: "NOT_FOUND", message: "token not found" } }, { status: 404 });
const invalid = () =>
  HttpResponse.json(
    { error: { code: "VALIDATION_FAILED", message: "invalid input" } },
    { status: 400 },
  );

/** US8: GET /settings, PUT /settings/mcp, GET/POST /tokens, DELETE /tokens/:id. */
export const settingsHandlers = [
  http.get("*/api/v1/settings", () => HttpResponse.json(settings)),
  http.put("*/api/v1/settings/mcp", async ({ request }) => {
    const parsed = UpdateMcpSettingsInputSchema.safeParse(await request.json());
    if (!parsed.success) return invalid();
    settings = { ...settings, mcp: { ...settings.mcp, enabled: parsed.data.enabled } };
    return HttpResponse.json(settings);
  }),
  http.get("*/api/v1/tokens", () => HttpResponse.json({ items: tokens })),
  http.post("*/api/v1/tokens", async ({ request }) => {
    const parsed = CreateApiTokenInputSchema.safeParse(await request.json());
    if (!parsed.success) return invalid();
    if (tokens.some((t) => t.name === parsed.data.name && t.revokedAt === null)) {
      return HttpResponse.json(
        { error: { code: "CONFLICT", message: "a token with this name already exists" } },
        { status: 409 },
      );
    }
    seq += 1;
    const token = ApiTokenSchema.parse({
      id: `01JCXK0000000000000000K${String(seq).padStart(3, "0")}`,
      name: parsed.data.name,
      scope: parsed.data.scope,
      createdAt: NOW,
      lastUsedAt: null,
      revokedAt: null,
    });
    tokens = [token, ...tokens];
    const body: CreateApiTokenResult = { token, secret: CREATED_TOKEN_SECRET };
    return HttpResponse.json(body, { status: 201 });
  }),
  http.delete("*/api/v1/tokens/:id", ({ params }) => {
    const existing = tokens.find((t) => t.id === params.id);
    if (!existing) return notFound();
    const revoked = { ...existing, revokedAt: existing.revokedAt ?? NOW };
    tokens = tokens.map((t) => (t.id === revoked.id ? revoked : t));
    return HttpResponse.json(revoked);
  }),
];
