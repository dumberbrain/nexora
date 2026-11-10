import { ExecutionConfigSchema, ModeOptionSchema, type TaskAnalysis } from "@ubuliera/contracts";
import { describe, expect, it } from "vitest";

import { adviseModes } from "../../../src/modules/execution-orchestrator/mode-advisor";
import { buildQuestions } from "../../../src/modules/execution-orchestrator/questions";
import { fakeEnvironment } from "../../fakes/fake-managed-runtime";

function analysis(
  complexity: TaskAnalysis["complexity"],
  testRunners: string[] = [],
): TaskAnalysis {
  return {
    stack: { languages: ["TypeScript"], frameworks: ["React"], testRunners },
    instructionFiles: ["CLAUDE.md"],
    skills: [],
    agents: [],
    mcpServers: [],
    complexity,
    summary: "",
    modelAssisted: false,
  };
}

const MULTI_GOAL = "1. Add a REST endpoint\n2. Build the settings page\n3. Write e2e tests";
const byMode = (opts: ReturnType<typeof adviseModes>) => new Map(opts.map((o) => [o.mode, o]));

describe("mode advisor", () => {
  it("returns one valid option per mode, exactly one recommended", () => {
    const opts = adviseModes({
      analysis: analysis("medium"),
      prompt: "Fix the login bug",
      env: fakeEnvironment(),
    });
    expect(opts.map((o) => o.mode).sort()).toEqual(
      ["agent_teams", "hybrid", "multi_session", "subagents", "workflow"].sort(),
    );
    for (const o of opts) ModeOptionSchema.parse(o);
    expect(opts.filter((o) => o.recommended)).toHaveLength(1);
    for (const o of opts) expect(o.reason.length).toBeGreaterThan(10);
  });

  it("Agent Teams is unavailable without CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, with how to enable", () => {
    const teams = byMode(
      adviseModes({ analysis: analysis("high"), prompt: MULTI_GOAL, env: fakeEnvironment() }),
    ).get("agent_teams");
    expect(teams?.available).toBe(false);
    expect(teams?.recommended).toBe(false);
    expect(teams?.unavailableReason).toMatch(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS/);
    expect(teams?.howToEnable).toMatch(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1/);
  });

  it("offers Agent Teams when the flag is set and the PTY runtime is available", () => {
    const teams = byMode(
      adviseModes({
        analysis: analysis("high"),
        prompt: MULTI_GOAL,
        env: fakeEnvironment({ agentTeams: true }),
      }),
    ).get("agent_teams");
    expect(teams?.available).toBe(true);
    expect(teams?.runtimes).toEqual(["agent_team_pty"]);
    expect(teams?.reason).toMatch(/lead/);
  });

  it("Agent Teams is unavailable (observe-only) when node-pty cannot load, even with the flag", () => {
    const env = fakeEnvironment({ agentTeams: true });
    env.runtimes = env.runtimes.map((r) =>
      r.kind === "agent_team_pty"
        ? { ...r, available: false, reason: "node-pty could not be loaded (x)" }
        : r,
    );
    const m = byMode(adviseModes({ analysis: analysis("high"), prompt: MULTI_GOAL, env }));
    expect(m.get("agent_teams")?.available).toBe(false);
    expect(m.get("agent_teams")?.unavailableReason).toMatch(/node-pty/);
    // hybrid still runs, without Agent Teams
    expect(m.get("hybrid")?.available).toBe(true);
    expect(m.get("hybrid")?.runtimes).not.toContain("agent_team_pty");
  });

  it("hybrid is available on session runtimes and adds the PTY runtime only with Agent Teams", () => {
    const off = byMode(
      adviseModes({ analysis: analysis("low"), prompt: "x", env: fakeEnvironment() }),
    );
    expect(off.get("hybrid")?.available).toBe(true);
    expect(off.get("hybrid")?.runtimes).toEqual(["agent_sdk", "cli_headless"]);
    const on = byMode(
      adviseModes({
        analysis: analysis("low"),
        prompt: "x",
        env: fakeEnvironment({ agentTeams: true }),
      }),
    );
    expect(on.get("hybrid")?.runtimes).toContain("agent_team_pty");
  });

  it("workflow is launched from the Workflows page, not from the execution wizard", () => {
    const m = byMode(
      adviseModes({ analysis: analysis("low"), prompt: "x", env: fakeEnvironment() }),
    );
    expect(m.get("workflow")?.available).toBe(false);
    expect(m.get("workflow")?.unavailableReason).toMatch(/Workflows page/);
  });

  it("everything is unavailable when Claude Code is not installed", () => {
    const env = fakeEnvironment();
    env.claude = { installed: false, version: null, authenticated: null, reason: "not on PATH" };
    env.runtimes = env.runtimes.map((r) => ({ ...r, available: false, reason: "not on PATH" }));
    const opts = adviseModes({ analysis: analysis("low"), prompt: "x", env });
    expect(opts.every((o) => !o.available && !o.recommended)).toBe(true);
    expect(byMode(opts).get("subagents")?.unavailableReason).toMatch(/not on PATH/);
  });

  it("recommends subagents for a single focused goal", () => {
    const m = byMode(
      adviseModes({
        analysis: analysis("low"),
        prompt: "Fix the off-by-one in pagination",
        env: fakeEnvironment(),
      }),
    );
    expect(m.get("subagents")?.recommended).toBe(true);
    expect(m.get("subagents")?.runtimes).toContain("agent_sdk");
  });

  it("recommends multi-session for several independent goals of higher complexity", () => {
    const m = byMode(
      adviseModes({ analysis: analysis("high"), prompt: MULTI_GOAL, env: fakeEnvironment() }),
    );
    expect(m.get("multi_session")?.recommended).toBe(true);
    expect(m.get("multi_session")?.reason).toMatch(/3/);
  });
});

describe("questions", () => {
  const config = ExecutionConfigSchema.parse({});

  it("asks parallelism questions only for multi-session, each with a recommended default", () => {
    const multi = buildQuestions({
      mode: "multi_session",
      strategy: "plan_first",
      analysis: analysis("high"),
      prompt: MULTI_GOAL,
      config,
    });
    const keys = multi.map((q) => q.key);
    expect(keys).toContain("parallelism");
    expect(keys).toContain("maxParallelSessions");
    expect(keys).toContain("approvalCheckpoints");
    expect(multi.find((q) => q.key === "maxParallelSessions")?.max).toBe(8);
    for (const q of multi) expect(q.recommendedDefault).not.toBeUndefined();

    const sub = buildQuestions({
      mode: "subagents",
      strategy: "direct",
      analysis: analysis("low"),
      prompt: "Fix a typo",
      config,
    }).map((q) => q.key);
    expect(sub).not.toContain("parallelism");
    expect(sub).not.toContain("maxParallelSessions");
  });

  it("asks about running tests only when a test runner was detected", () => {
    const withTests = buildQuestions({
      mode: "subagents",
      strategy: "direct",
      analysis: analysis("low", ["Vitest"]),
      prompt: "x",
      config,
    });
    expect(withTests.find((q) => q.key === "runTestsOnVerify")?.recommendedDefault).toBe(false);
    const without = buildQuestions({
      mode: "subagents",
      strategy: "direct",
      analysis: analysis("low"),
      prompt: "x",
      config,
    });
    expect(without.some((q) => q.key === "runTestsOnVerify")).toBe(false);
  });

  it("only uses ExecutionConfig fields or answers.<name> as keys", () => {
    const allowed = new Set(Object.keys(ExecutionConfigSchema.shape));
    const qs = buildQuestions({
      mode: "multi_session",
      strategy: "tdd",
      analysis: analysis("very_high"),
      prompt: MULTI_GOAL,
      config,
    });
    for (const q of qs) expect(allowed.has(q.key) || q.key.startsWith("answers.")).toBe(true);
  });
});
