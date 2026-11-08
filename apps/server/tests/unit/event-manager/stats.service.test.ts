import { type Stats } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { executions, projects, sessions } from "../../../src/db/schema";
import { computeStats, StatsService } from "../../../src/modules/event-manager/stats.service";
import { EXTERNAL_OBSERVED_CAPABILITIES } from "../../../src/modules/session-manager";

let db: Db;
beforeEach(() => {
  vi.useFakeTimers();
  db = openDb({ dataDir: ":memory:" });
});
afterEach(() => {
  closeDb(db);
  vi.useRealTimers();
});

const session = (id: string, status: "running" | "idle" | "stopped") =>
  db
    .insert(sessions)
    .values({
      id,
      executionId: null,
      projectId: null,
      runtime: "external_observed",
      observeOnly: true,
      cwd: "/w",
      status,
      capabilities: EXTERNAL_OBSERVED_CAPABILITIES,
      lastActivityAt: 1,
      startedAt: 1,
    })
    .run();

describe("computeStats", () => {
  it("counts active sessions and reports the running execution's mode", () => {
    session("a", "running");
    session("b", "idle");
    session("c", "stopped");
    db.insert(projects)
      .values({
        id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        name: "p",
        rootPath: "/p",
        detectedStack: { languages: [], frameworks: [], testRunners: [] },
        instructionFiles: [],
        createdAt: 1,
      })
      .run();
    db.insert(executions)
      .values({
        id: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        prompt: "x",
        mode: "subagents",
        config: {} as never,
        status: "running",
        createdAt: 1,
        startedAt: 2,
      })
      .run();
    expect(computeStats(db)).toMatchObject({ activeSessions: 2, currentMode: "subagents" });
  });
});

describe("StatsService throttle", () => {
  it("publishes at most twice per second, trailing", () => {
    const published: Stats[] = [];
    let now = 0;
    const svc = new StatsService(db, (s) => published.push(s), { now: () => now });
    svc.schedule();
    vi.advanceTimersByTime(0);
    expect(published).toHaveLength(1);

    for (let i = 0; i < 50; i++) svc.schedule(); // burst right after a publication
    now = 100;
    vi.advanceTimersByTime(100);
    expect(published).toHaveLength(1);
    session("late", "running");
    now = 500;
    vi.advanceTimersByTime(400);
    expect(published).toHaveLength(2);
    expect(published[1]?.activeSessions).toBe(1); // trailing emission sees the latest state
    svc.close();
  });
});
