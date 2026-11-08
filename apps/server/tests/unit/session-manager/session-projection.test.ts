import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { type EntityChanged, RuntimeCapabilityProfileSchema } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXTERNAL_OBSERVED_CAPABILITIES } from "../../../src/modules/session-manager";
import { createHarness, type Harness } from "../../helpers/us1";

let h: Harness;
let changes: EntityChanged[];
let projectId: string;
let clock = 1_700_000_000_000;

beforeEach(async () => {
  h = createHarness({ gitBranch: "feature/x" });
  projectId = (await h.services.projects.register({ rootPath: h.tmp }, "user")).id;
  changes = [];
  h.bus.onEntityChanged((c) => changes.push(c));
});
afterEach(() => h.close());

const apply = (hookEventName: string, over: { sessionId?: string; cwd?: string } = {}) =>
  h.services.sessionProjection.apply({
    sessionId: over.sessionId ?? "sess-1",
    hookEventName,
    cwd: over.cwd ?? h.tmp,
    tokenProjectId: projectId,
    ts: clock++,
  });

describe("SessionProjection", () => {
  it("creates an observe-only session from the first event of any type", () => {
    const s = apply("PreToolUse");
    expect(s).toMatchObject({
      id: "sess-1",
      runtime: "external_observed",
      observeOnly: true,
      status: "running",
      executionId: null,
      projectId,
      cwd: h.tmp,
      endedAt: null,
      usage: null,
      pid: null,
      model: null,
    });
    expect(s.startedAt).toBe(s.lastActivityAt);
    expect(h.services.sessions.get("sess-1")).toEqual(s);
    expect(changes.some((c) => c.kind === "session" && c.id === "sess-1")).toBe(true);
  });

  it("uses a capability profile that cannot control the session", () => {
    const caps = RuntimeCapabilityProfileSchema.parse(EXTERNAL_OBSERVED_CAPABILITIES);
    expect(caps.runtime).toBe("external_observed");
    for (const k of [
      "canStart",
      "canStop",
      "canInterrupt",
      "canPause",
      "canResume",
      "canRestart",
      "canSetPermissionMode",
    ] as const) {
      expect(caps[k], k).toBe(false);
    }
    expect(caps.canSendMessage).toBe("no");
    expect(caps.reportsUsage).toBe("none");
    expect(caps.emitsEvents).toContain("tool.invoked");
    expect(caps.notes.length).toBeGreaterThan(0);
    expect(apply("Stop").capabilities).toEqual(EXTERNAL_OBSERVED_CAPABILITIES);
  });

  it("transitions running → idle → running → stopped and tracks lastActivityAt", () => {
    const first = apply("UserPromptSubmit");
    expect(first.status).toBe("running");
    const idle = apply("Stop");
    expect(idle.status).toBe("idle");
    expect(idle.lastActivityAt).toBeGreaterThan(first.lastActivityAt);
    expect(apply("Notification").status).toBe("idle");
    expect(apply("UserPromptSubmit").status).toBe("running");
    expect(apply("PermissionRequest").status).toBe("waiting_for_approval");
    expect(apply("PostToolUse").status).toBe("running");
    const stopped = apply("SessionEnd");
    expect(stopped.status).toBe("stopped");
    expect(stopped.endedAt).toBe(stopped.lastActivityAt);
  });

  it("marks the session failed on StopFailure", () => {
    apply("UserPromptSubmit");
    expect(apply("StopFailure").status).toBe("failed");
  });

  it("emits entity.changed patches for status changes", () => {
    apply("UserPromptSubmit");
    changes.length = 0;
    apply("Stop");
    const patch = changes.find((c) => c.kind === "session")?.patch;
    expect(patch).toMatchObject({ status: "idle" });
  });

  it("resolves the git branch once, asynchronously, and publishes it", async () => {
    const s = apply("UserPromptSubmit");
    expect(s.gitBranch).toBeNull();
    apply("PreToolUse");
    await h.services.sessionProjection.settled();
    expect(h.services.sessions.get("sess-1")?.gitBranch).toBe("feature/x");
    expect(h.gitCalls).toHaveLength(1);
    expect(changes.some((c) => c.kind === "session" && c.patch.gitBranch === "feature/x")).toBe(
      true,
    );
  });

  it("resolves the project of an unknown cwd under a registered root", async () => {
    const nested = join(h.tmp, "nested");
    mkdirSync(nested);
    const other = (await h.services.projects.register({ rootPath: nested }, "user")).id;
    expect(apply("Stop", { sessionId: "s-nested", cwd: join(nested, "src") }).projectId).toBe(
      other,
    );
    expect(apply("Stop", { sessionId: "s-root", cwd: h.tmp }).projectId).toBe(projectId);
    // cwd outside every registered root → falls back to the project whose token was used
    expect(apply("Stop", { sessionId: "s-out", cwd: "/somewhere/else" }).projectId).toBe(projectId);
  });

  it("never fails ingest when the git lookup fails", async () => {
    h.close();
    h = createHarness({ gitFails: true });
    projectId = (await h.services.projects.register({ rootPath: h.tmp }, "user")).id;
    apply("Stop");
    await h.services.sessionProjection.settled();
    expect(h.services.sessions.get("sess-1")?.gitBranch).toBeNull();
  });
});
