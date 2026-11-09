import { type PlannedTask } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import {
  HYBRID_MECHANISMS,
  planHybrid,
} from "../../../src/modules/execution-orchestrator/planner/hybrid-planner";
import { heuristicPlan } from "../../../src/modules/execution-orchestrator/planner/planner";

const task = (patch: Partial<PlannedTask> = {}): PlannedTask => ({
  title: "Do something",
  description: "Do something",
  assignedAgentRole: null,
  dependsOn: [],
  priority: "p2",
  ownedPaths: ["**"],
  riskClass: "normal",
  mechanismReason: null,
  ...patch,
});

const ON = { agentTeams: { available: true, reason: null } };
const OFF = {
  agentTeams: { available: false, reason: "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is not set" },
};

const PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Investigate the flaky checkout bug with a team of teammates debating competing hypotheses",
  "3. Deploy the result to production",
  "4. Review the whole codebase for security issues",
].join("\n");

describe("hybrid planner (T136)", () => {
  it("gives every task a mechanism and a non-empty reason", () => {
    for (const ctx of [ON, OFF]) {
      const plan = planHybrid(heuristicPlan({ prompt: PROMPT, sequential: false }), ctx);
      expect(plan).toHaveLength(4);
      for (const t of plan) {
        expect(HYBRID_MECHANISMS).toContain(t.mode);
        expect(t.mechanismReason.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("never chooses Agent Teams when they are unavailable — and says why", () => {
    const plan = planHybrid(heuristicPlan({ prompt: PROMPT, sequential: false }), OFF);
    expect(plan.some((t) => t.mode === "agent_teams")).toBe(false);
    const teamish = plan[1];
    expect(teamish?.mode).toBe("subagents");
    expect(teamish?.mechanismReason).toMatch(/Agent Teams/);
    expect(teamish?.mechanismReason).toMatch(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS/);
    expect(teamish?.mechanismReason).toMatch(/not simulated|never simulate|no simulated/i);
  });

  it("uses Agent Teams for team-shaped work when available", () => {
    const plan = planHybrid(heuristicPlan({ prompt: PROMPT, sequential: false }), ON);
    expect(plan[1]?.mode).toBe("agent_teams");
    expect(plan[1]?.mechanismReason).toMatch(/lead/i);
  });

  it("scoped tasks get their own session; risky ones too; broad ones go to subagents", () => {
    const plan = planHybrid(heuristicPlan({ prompt: PROMPT, sequential: false }), ON);
    expect(plan[0]).toMatchObject({ mode: "multi_session" });
    expect(plan[0]?.mechanismReason).toMatch(/src\/api\/users\.ts/);
    expect(plan[2]).toMatchObject({ mode: "multi_session", riskClass: "deploy" });
    expect(plan[2]?.mechanismReason).toMatch(/deploy/);
    expect(plan[3]).toMatchObject({ mode: "subagents" });
  });

  it("keeps a model planner's own note but still decides the mechanism itself", () => {
    const [t] = planHybrid(
      [task({ ownedPaths: ["src/a.ts"], mechanismReason: "small isolated edit" })],
      OFF,
    );
    expect(t?.mode).toBe("multi_session");
    expect(t?.mechanismReason).toMatch(/small isolated edit/);
    expect(t?.mechanismReason).toMatch(/src\/a\.ts/);
  });

  it("keeps the rest of the planned task unchanged", () => {
    const input = task({ title: "X", dependsOn: ["T-1"], ownedPaths: ["lib/**"] });
    const [t] = planHybrid([input], ON);
    expect(t).toMatchObject({ ...input, mechanismReason: expect.any(String) as unknown });
  });
});
