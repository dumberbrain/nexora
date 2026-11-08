import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  AgentDetailSchema,
  EventSchema,
  HookPreviewSchema,
  pageSchema,
  ProjectListSchema,
  ProjectSchema,
  SessionDetailSchema,
  SessionListSchema,
  StatsSchema,
} from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  connectProject,
  createHarness,
  type Harness,
  hookFixtures,
  HOST,
  login,
  postHook,
} from "../../helpers/us1";

const SESSION = "7448f0f2-4201-4d73-a3bc-92657df6269f";
const SUBAGENT = "ae0883f726e201b87";

let h: Harness;
let auth: { cookie: string; csrf: string };

beforeEach(async () => {
  h = createHarness();
  auth = await login(h.app);
});
afterEach(() => h.close());

const get = (path: string) =>
  h.app.request(`/api/v1${path}`, { headers: { ...HOST, cookie: auth.cookie } });
const send = (method: string, path: string, body?: unknown, csrf = true) =>
  h.app.request(`/api/v1${path}`, {
    method,
    headers: {
      ...HOST,
      cookie: auth.cookie,
      "content-type": "application/json",
      ...(csrf ? { "x-nexora-csrf": auth.csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

async function ingestFixtures() {
  const { token, projectId } = await connectProject(h);
  for (const { body } of hookFixtures()) expect((await postHook(h, body, token)).status).toBe(200);
  return { projectId };
}

describe("projects routes", () => {
  it("requires authentication", async () => {
    const res = await h.app.request("/api/v1/projects", { headers: HOST });
    expect(res.status).toBe(401);
  });

  it("registers a project (realpath, default name, detected stack) and lists it", async () => {
    writeFileSync(
      join(h.tmp, "package.json"),
      JSON.stringify({
        devDependencies: { vitest: "1", typescript: "5" },
        dependencies: { react: "19" },
      }),
    );
    writeFileSync(join(h.tmp, "package-lock.json"), "{}");
    writeFileSync(join(h.tmp, "CLAUDE.md"), "# rules");
    const res = await send("POST", "/projects", { rootPath: h.tmp });
    expect(res.status).toBe(201);
    const project = ProjectSchema.parse(await res.json());
    expect(project.rootPath).toBe(realpathSync.native(h.tmp));
    expect(project.name.length).toBeGreaterThan(0);
    expect(project.hooksInstalled).toBe(false);
    expect(project.detectedStack).toMatchObject({ packageManager: "npm" });
    expect(project.detectedStack.languages).toEqual(
      expect.arrayContaining(["JavaScript", "TypeScript"]),
    );
    expect(project.detectedStack.frameworks).toContain("React");
    expect(project.detectedStack.testRunners).toContain("Vitest");
    expect(project.instructionFiles).toEqual(["CLAUDE.md"]);

    const list = ProjectListSchema.parse(await (await get("/projects")).json());
    expect(list.items.map((p) => p.id)).toEqual([project.id]);
    expect(h.audit.list({ limit: 5 }).items[0]).toMatchObject({
      action: "project.register",
      actor: "user",
      outcome: "success",
      targetId: project.id,
    });
  });

  it("uses the given name, rejects duplicates (409), missing and non-directory paths (400)", async () => {
    const ok = await send("POST", "/projects", { rootPath: h.tmp, name: "Demo" });
    expect(ProjectSchema.parse(await ok.json()).name).toBe("Demo");
    const dup = await send("POST", "/projects", { rootPath: h.tmp });
    expect(dup.status).toBe(409);
    expect(await errorCode(dup)).toBe("CONFLICT");
    const missing = await send("POST", "/projects", { rootPath: join(h.tmp, "nope") });
    expect(missing.status).toBe(400);
    writeFileSync(join(h.tmp, "file.txt"), "x");
    expect((await send("POST", "/projects", { rootPath: join(h.tmp, "file.txt") })).status).toBe(
      400,
    );
    expect((await send("POST", "/projects", { rootPath: "relative/path" })).status).toBe(400);
    expect((await send("POST", "/projects", "{bad json")).status).toBe(400);
  });

  it("needs CSRF for mutations", async () => {
    expect((await send("POST", "/projects", { rootPath: h.tmp }, false)).status).toBe(403);
  });
});

describe("hook routes", () => {
  let id: string;
  beforeEach(async () => {
    const res = await send("POST", "/projects", { rootPath: h.tmp });
    id = ProjectSchema.parse(await res.json()).id;
  });

  it("previews, installs only with confirm:true, and uninstalls", async () => {
    const preview = HookPreviewSchema.parse(
      await (await get(`/projects/${id}/hooks/preview`)).json(),
    );
    expect(preview.exists).toBe(false);
    // the real secret is generated at install time and never returned by the API
    expect(preview.after).toContain('"X-Nexora-Hook-Token": "<generated on install>"');

    expect((await send("POST", `/projects/${id}/hooks/install`, {})).status).toBe(400);
    expect((await send("POST", `/projects/${id}/hooks/install`, { confirm: false })).status).toBe(
      400,
    );
    const installed = await send("POST", `/projects/${id}/hooks/install`, { confirm: true });
    expect(installed.status).toBe(200);
    expect(ProjectSchema.parse(await installed.json()).hooksInstalled).toBe(true);

    const removed = await send("DELETE", `/projects/${id}/hooks`);
    expect(removed.status).toBe(200);
    expect(ProjectSchema.parse(await removed.json()).hooksInstalled).toBe(false);
  });

  it("returns 404 for unknown projects", async () => {
    expect((await get("/projects/01ARZ3NDEKTSV4RRFFQ69G5FAV/hooks/preview")).status).toBe(404);
    expect((await get("/projects/not-a-ulid/hooks/preview")).status).toBe(404);
  });
});

describe("read routes after ingesting the recorded session", () => {
  it("GET /sessions and /sessions/:id", async () => {
    const { projectId } = await ingestFixtures();
    const list = SessionListSchema.parse(await (await get("/sessions")).json());
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: SESSION,
      projectId,
      runtime: "external_observed",
      observeOnly: true,
      status: "stopped",
      cwd: "C:\\work\\demo-repo",
    });
    expect(
      SessionListSchema.parse(await (await get("/sessions?status=running,idle")).json()).items,
    ).toHaveLength(0);
    const detail = SessionDetailSchema.parse(await (await get(`/sessions/${SESSION}`)).json());
    expect(detail.session.capabilities.canStop).toBe(false);
    expect(detail.agents.map((a) => a.id).sort()).toEqual([SESSION, SUBAGENT].sort());
    expect((await get("/sessions/nope")).status).toBe(404);
    expect((await get("/sessions?status=bogus")).status).toBe(400);
  });

  it("GET /agents/:id with children and files changed", async () => {
    await ingestFixtures();
    const main = AgentDetailSchema.parse(await (await get(`/agents/${SESSION}`)).json());
    expect(main.children.map((a) => a.id)).toEqual([SUBAGENT]);
    expect(main.session?.id).toBe(SESSION);
    expect(main.filesChanged).toEqual([]);
    const sub = AgentDetailSchema.parse(await (await get(`/agents/${SUBAGENT}`)).json());
    expect(sub.filesChanged).toEqual(["hello.txt"]);
    expect(sub.agent.parentAgentId).toBe(SESSION);
    expect((await get("/agents/nope")).status).toBe(404);
  });

  it("GET /events filters and paginates", async () => {
    await ingestFixtures();
    const Page = pageSchema(EventSchema);
    const all = Page.parse(await (await get("/events?limit=200")).json());
    expect(all.items).toHaveLength(12);
    const files = Page.parse(await (await get("/events?type=file.modified")).json());
    expect(files.items).toHaveLength(1);
    const first = Page.parse(await (await get("/events?limit=5")).json());
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).toBe(first.items.at(-1)?.id);
    const second = Page.parse(
      await (await get(`/events?limit=5&cursor=${first.nextCursor ?? ""}`)).json(),
    );
    expect((second.items[0]?.id ?? "") < (first.items.at(-1)?.id ?? "")).toBe(true);
    const byAgent = Page.parse(await (await get(`/events?agentId=${SUBAGENT}`)).json());
    expect(byAgent.items.every((e) => e.agentId === SUBAGENT)).toBe(true);
    expect((await get("/events?limit=0")).status).toBe(400);
  });

  it("GET /events/export streams jsonl and csv", async () => {
    await ingestFixtures();
    const jsonl = await get("/events/export?format=jsonl");
    expect(jsonl.status).toBe(200);
    expect(jsonl.headers.get("content-disposition")).toMatch(
      /^attachment; filename="nexora-events-.+\.jsonl"$/,
    );
    const lines = (await jsonl.text()).trim().split("\n");
    expect(lines).toHaveLength(12);
    const parsed = lines.map((l) => EventSchema.parse(JSON.parse(l)));
    expect(parsed[0]?.type).toBe("session.stopped"); // newest first

    const csv = await get(`/events/export?format=csv&type=file.modified`);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const rows = (await csv.text()).trim().split("\r\n");
    expect(rows[0]).toBe(
      "id,ts,type,source,reliability,severity,executionId,sessionId,agentId,taskId,summary",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("file.modified,hook,derived");
  });

  it("guards CSV cells against formula injection", async () => {
    const { token } = await connectProject(h);
    await postHook(
      h,
      {
        session_id: "s-formula",
        cwd: "/w",
        hook_event_name: "UserPromptSubmit",
        prompt: 'x", =1+1',
      },
      token,
    );
    await postHook(
      h,
      {
        session_id: "s-formula",
        cwd: "/w",
        hook_event_name: "PreToolUse",
        tool_name: "=HYPERLINK(1)",
      },
      token,
    );
    const text = await (await get("/events/export?format=csv&sessionId=s-formula")).text();
    expect(text).toContain(",'=HYPERLINK(1)");
    expect(text).toContain('"User prompt: x"", =1+1"');
  });

  it("GET /stats reflects live sessions and agents", async () => {
    const { token } = await connectProject(h);
    const [prompt, , start] = hookFixtures();
    await postHook(h, prompt?.body, token);
    await postHook(h, start?.body, token);
    const stats = StatsSchema.parse(await (await get("/stats")).json());
    expect(stats).toMatchObject({
      activeSessions: 1,
      activeAgents: 2,
      idleAgents: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingApprovals: 0,
      runningWorkflows: 0,
      currentMode: null,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.published.at(-1)).toEqual(stats);
  });

  it("read routes require authentication", async () => {
    for (const path of ["/sessions", "/agents", "/events", "/events/export", "/stats"]) {
      expect((await h.app.request(`/api/v1${path}`, { headers: HOST })).status, path).toBe(401);
    }
  });
});

describe("projects on disk", () => {
  it("keeps paths with spaces and nested folders", async () => {
    const dir = join(h.tmp, "my project");
    mkdirSync(dir);
    const res = await send("POST", "/projects", { rootPath: dir });
    expect(ProjectSchema.parse(await res.json()).name).toBe("my project");
  });
});
