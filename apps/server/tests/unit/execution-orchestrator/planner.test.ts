import { PlannedTaskSchema } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import {
  heuristicPlan,
  parsePlanOutput,
} from "../../../src/modules/execution-orchestrator/planner/planner";
import { splitSubGoals } from "../../../src/modules/execution-orchestrator/subgoals";

describe("splitSubGoals", () => {
  it("splits numbered and bulleted lists", () => {
    expect(splitSubGoals("Do this:\n1. First thing\n2) Second thing\n- Third thing")).toEqual([
      "First thing",
      "Second thing",
      "Third thing",
    ]);
  });

  it("keeps a single goal intact", () => {
    expect(splitSubGoals("Fix the login bug when the session expires")).toEqual([
      "Fix the login bug when the session expires",
    ]);
  });
});

describe("heuristicPlan", () => {
  it("creates one honest task per sub-goal with roles, risks and explicit paths", () => {
    const plan = heuristicPlan({
      prompt:
        "1. Add a migration for the users table in db/migrations/\n2. Write tests\n3. Drop the legacy sessions table",
      sequential: false,
    });
    for (const t of plan) PlannedTaskSchema.parse(t);
    expect(plan).toHaveLength(3);
    expect(plan[0]).toMatchObject({
      assignedAgentRole: "database-engineer",
      ownedPaths: ["db/migrations/**"],
      riskClass: "normal",
    });
    expect(plan[1]).toMatchObject({ assignedAgentRole: "qa-engineer", ownedPaths: ["**"] });
    expect(plan[2]?.riskClass).toBe("destructive");
    expect(plan.every((t) => t.dependsOn.length === 0)).toBe(true);
  });

  it("chains tasks when sequential and caps titles at 200 chars", () => {
    const plan = heuristicPlan({ prompt: `- ${"a".repeat(300)}\n- second`, sequential: true });
    expect(plan[0]?.title.length).toBeLessThanOrEqual(200);
    expect(plan[1]?.dependsOn).toEqual(["T-1"]);
  });

  it("falls back to a single task holding the whole prompt", () => {
    const plan = heuristicPlan({ prompt: "Improve error messages", sequential: false });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.description).toBe("Improve error messages");
  });
});

describe("parsePlanOutput (untrusted model output)", () => {
  const task = {
    title: "A",
    description: "",
    assignedAgentRole: null,
    dependsOn: [],
    priority: "p2",
    ownedPaths: ["**"],
    riskClass: "normal",
    mechanismReason: null,
  };

  it("accepts fenced JSON and repairs references to unknown/self tasks", () => {
    const text = `Here you go:\n\`\`\`json\n${JSON.stringify({
      tasks: [task, { ...task, title: "B", dependsOn: ["T-1", "T-2", "T-9"] }],
    })}\n\`\`\``;
    const plan = parsePlanOutput(text);
    expect(plan.map((t) => t.dependsOn)).toEqual([[], ["T-1"]]);
  });

  it.each([
    ["not json at all"],
    [JSON.stringify({ tasks: [] })],
    [JSON.stringify({ tasks: [{ ...task, riskClass: "yolo" }] })],
    [JSON.stringify({ tasks: [{ ...task, title: "" }] })],
    [
      JSON.stringify({
        tasks: [
          { ...task, dependsOn: ["T-2"] },
          { ...task, dependsOn: ["T-1"] },
        ],
      }),
    ],
  ])("rejects invalid output %#", (text) => {
    expect(() => parsePlanOutput(text)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });
});
