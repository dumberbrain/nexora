import {
  type ApiErrorBody,
  type HookPreview,
  type Project,
  type ProjectList,
} from "@nexora/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

export const projectFixtures: Project[] = [
  {
    id: "01JCXK0000000000000000P001",
    name: "nexora",
    rootPath: "C:/work/nexora",
    detectedStack: {
      languages: ["typescript"],
      frameworks: ["react", "hono"],
      packageManager: "npm",
      testRunners: ["vitest", "playwright"],
    },
    instructionFiles: ["CLAUDE.md"],
    hooksInstalled: true,
    createdAt: NOW - 86_400_000,
    lastAnalyzedAt: NOW - 3_600_000,
  },
  {
    id: "01JCXK0000000000000000P002",
    name: "billing-api",
    rootPath: "/home/dev/billing-api",
    detectedStack: { languages: ["go"], frameworks: [], testRunners: ["go test"] },
    instructionFiles: [],
    hooksInstalled: false,
    createdAt: NOW - 7_200_000,
    lastAnalyzedAt: null,
  },
];

const SETTINGS_BEFORE = `{
  "permissions": {
    "allow": ["Bash(npm test)"]
  }
}`;

const SETTINGS_AFTER = `{
  "permissions": {
    "allow": ["Bash(npm test)"]
  },
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:3022/api/v1/hooks/ingest" }] }]
  }
}`;

export const hookPreviewFixture: HookPreview = {
  settingsPath: "/home/dev/billing-api/.claude/settings.local.json",
  exists: true,
  before: SETTINGS_BEFORE,
  after: SETTINGS_AFTER,
  events: ["PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop", "Stop"],
  alreadyInstalled: false,
};

const conflict: ApiErrorBody = {
  error: { code: "CONFLICT", message: "project already registered" },
};

export const projectHandlers = [
  http.get("*/api/v1/projects", () => HttpResponse.json<ProjectList>({ items: projectFixtures })),
  http.post("*/api/v1/projects", async ({ request }) => {
    const body = (await request.json()) as { rootPath: string; name?: string };
    if (projectFixtures.some((p) => p.rootPath === body.rootPath)) {
      return HttpResponse.json(conflict, { status: 409 });
    }
    const created: Project = {
      ...projectFixtures[1]!,
      id: "01JCXK0000000000000000P003",
      rootPath: body.rootPath,
      name: body.name ?? body.rootPath.split(/[\\/]/).pop() ?? body.rootPath,
      hooksInstalled: false,
    };
    return HttpResponse.json(created, { status: 201 });
  }),
  http.get("*/api/v1/projects/:id/hooks/preview", ({ params }) =>
    HttpResponse.json<HookPreview>({
      ...hookPreviewFixture,
      alreadyInstalled: projectFixtures.find((p) => p.id === params.id)?.hooksInstalled ?? false,
    }),
  ),
  http.post("*/api/v1/projects/:id/hooks/install", () => HttpResponse.json({ ok: true })),
  http.delete("*/api/v1/projects/:id/hooks", () => new HttpResponse(null, { status: 204 })),
];
