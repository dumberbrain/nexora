import { AgentListSchema, type EventType, type NexoraEvent } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  connectProject,
  createHarness,
  type Harness,
  hookFixtures,
  HOST,
  login,
  postHook,
} from "../helpers/us1";

/** contracts/runtime-adapter.md → "Hook ingest payload → normalised event". */
const EXPECTED: Record<string, EventType[]> = {
  "001-UserPromptSubmit.json": ["message.sent"],
  "002-PreToolUse.json": ["tool.invoked"],
  "003-SubagentStart.json": ["agent.spawned"],
  "004-PreToolUse.json": ["tool.invoked"],
  "005-PostToolUse.json": ["tool.completed", "file.modified"],
  "006-PreToolUse.json": ["tool.invoked"],
  "007-PostToolUse.json": ["tool.completed"],
  "008-SubagentStop.json": ["agent.completed"],
  "009-PostToolUse.json": ["tool.completed"],
  "010-Stop.json": ["agent.waiting"],
  "011-SessionEnd.json": ["session.stopped"],
};

const SESSION = "7448f0f2-4201-4d73-a3bc-92657df6269f";
const SUBAGENT = "ae0883f726e201b87";

let h: Harness;
let token: string;
let seen: NexoraEvent[];

beforeEach(async () => {
  h = createHarness();
  ({ token } = await connectProject(h));
  seen = [];
  h.bus.onEvent((e) => seen.push(e));
});
afterEach(() => h.close());

async function replayAll(): Promise<Map<string, NexoraEvent[]>> {
  const byFixture = new Map<string, NexoraEvent[]>();
  for (const { name, body } of hookFixtures()) {
    const before = seen.length;
    const res = await postHook(h, body, token);
    expect(res.status, name).toBe(200);
    expect(await res.json(), name).toEqual({});
    byFixture.set(name, seen.slice(before));
  }
  return byFixture;
}

describe("POST /api/v1/hooks/ingest — recorded Claude Code fixtures", () => {
  it("maps every fixture to the documented event types", async () => {
    const byFixture = await replayAll();
    expect(byFixture.size).toBe(Object.keys(EXPECTED).length);
    for (const [name, events] of byFixture) {
      expect(
        events.map((e) => e.type),
        name,
      ).toEqual(EXPECTED[name]);
      for (const e of events) {
        expect(e.source).toBe("hook");
        expect(e.sessionId).toBe(SESSION);
        expect(e.executionId).toBeNull();
      }
    }
  });

  it("tags hook events authoritative and the Write-derived file.modified as derived", async () => {
    const byFixture = await replayAll();
    const [completed, modified] = byFixture.get("005-PostToolUse.json") ?? [];
    expect(completed?.reliability).toBe("authoritative");
    expect(modified?.reliability).toBe("derived");
    expect(modified?.agentId).toBe(SUBAGENT);
    expect(modified?.summary).toContain("hello.txt");
    expect(modified?.payload).toMatchObject({ path: "hello.txt", tool: "Write" });
  });

  it("attributes subagent events to the subagent and main-agent events to no agent", async () => {
    const byFixture = await replayAll();
    expect(byFixture.get("004-PreToolUse.json")?.[0]?.agentId).toBe(SUBAGENT);
    expect(byFixture.get("002-PreToolUse.json")?.[0]?.agentId).toBeNull();
    expect(byFixture.get("003-SubagentStart.json")?.[0]?.summary).toBe(
      "Spawned general-purpose subagent",
    );
    expect(byFixture.get("004-PreToolUse.json")?.[0]?.summary).toBe("Write hello.txt");
    expect(byFixture.get("011-SessionEnd.json")?.[0]?.summary).toBe("Session ended (other)");
  });

  it("builds the agent tree main → general-purpose subagent", async () => {
    await replayAll();
    const { cookie } = await login(h.app);
    const res = await h.app.request(`/api/v1/agents?sessionId=${SESSION}`, {
      headers: { ...HOST, cookie },
    });
    expect(res.status).toBe(200);
    const { items } = AgentListSchema.parse(await res.json());
    const main = items.find((a) => a.kind === "main");
    const sub = items.find((a) => a.kind === "subagent");
    expect(main).toMatchObject({ id: SESSION, parentAgentId: null, name: "main" });
    expect(sub).toMatchObject({
      id: SUBAGENT,
      parentAgentId: SESSION,
      name: "general-purpose",
      role: "general-purpose",
      status: "completed",
      currentTaskId: null,
    });
    expect(sub?.summary).toContain("hello.txt");
  });

  it("redacts secrets in stored payloads", async () => {
    const res = await postHook(
      h,
      {
        session_id: SESSION,
        cwd: "C:\\work\\demo-repo",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop' x" },
        tool_use_id: "toolu_x",
      },
      token,
    );
    expect(res.status).toBe(200);
    const e = seen.at(-1);
    expect(JSON.stringify(e)).not.toContain("abcdefghijklmnop");
  });
});

describe("POST /api/v1/hooks/ingest — auth and validation", () => {
  const body = { session_id: SESSION, hook_event_name: "Stop", cwd: "C:\\work\\demo-repo" };

  it("rejects a missing token with 401", async () => {
    const res = await postHook(h, body, undefined);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHENTICATED");
    expect(seen).toHaveLength(0);
  });

  it("rejects an unknown token with 401", async () => {
    const res = await postHook(h, body, "not-the-token");
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it("rejects the old token after hooks are reinstalled (rotation)", async () => {
    await h.services.hookInstaller.install(h.services.projects.list()[0]?.id ?? "", "user");
    expect((await postHook(h, body, token)).status).toBe(401);
  });

  it("does not need the session cookie or CSRF header", async () => {
    expect((await postHook(h, body, token)).status).toBe(200);
  });

  it("rejects a body without session_id / hook_event_name with 400", async () => {
    const res = await postHook(h, { hook_event_name: "Stop" }, token);
    expect(res.status).toBe(400);
    expect((await postHook(h, "not json", token)).status).toBe(400);
    expect((await postHook(h, [1, 2], token)).status).toBe(400);
  });

  it("rejects non-loopback peers when the remote address is known", async () => {
    const remote = { incoming: { socket: { remoteAddress: "10.1.2.3" } } };
    expect((await postHook(h, body, token, remote)).status).toBe(403);
    const local = { incoming: { socket: { remoteAddress: "::ffff:127.0.0.1" } } };
    expect((await postHook(h, body, token, local)).status).toBe(200);
  });

  it("hands accepted payloads to observers (Agent Teams leads); a failing observer is isolated", async () => {
    const seenByObserver: string[] = [];
    h.services.ingest.addObserver(() => {
      throw new Error("observer boom");
    });
    const off = h.services.ingest.addObserver((p) => seenByObserver.push(p.hook_event_name));
    expect((await postHook(h, body, token)).status).toBe(200);
    expect(seenByObserver).toEqual(["Stop"]);
    off();
    await postHook(h, body, token);
    expect(seenByObserver).toHaveLength(1);
    expect((await postHook(h, body, undefined)).status).toBe(401);
    expect(seenByObserver).toHaveLength(1);
  });

  it("accepts unknown hook events without failing", async () => {
    const res = await postHook(h, { ...body, hook_event_name: "SomethingNew" }, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
