import { describe, expect, it } from "vitest";

import { makeNode } from "@/entities/workflow";

import { propertySchema, toFormValues } from "./property-form";

describe("property form", () => {
  it("round-trips a node through form values", () => {
    const node = {
      ...makeNode("agent", "agent-1", { x: 0, y: 0 }),
      config: { role: "implementer", prompt: "Do it", ownedPaths: ["src/**", "tests/**"] },
      onError: { goto: "end" },
    };
    const values = toFormValues(node);
    expect(values).toMatchObject({
      config: { ownedPaths: "src/**\ntests/**" },
      onErrorMode: "goto",
      onErrorTarget: "end",
    });
    const out = propertySchema("agent").parse(values);
    expect(out).toEqual({
      label: "Agent",
      config: { role: "implementer", prompt: "Do it", ownedPaths: ["src/**", "tests/**"] },
      retry: { maxAttempts: 1, backoffMs: 0 },
      onError: { goto: "end" },
    });
  });

  it("reports missing required config and an out-of-range retry with readable messages", () => {
    const values = { ...toFormValues(makeNode("agent", "a", { x: 0, y: 0 })), maxAttempts: 9 };
    const result = propertySchema("agent").safeParse(values);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    expect(messages).toContain("config.prompt: Prompt is required");
    expect(messages).toContain("maxAttempts: At most 5 attempts");
  });

  it("requires a goto target and keeps structural nodes config-free", () => {
    const base = toFormValues(makeNode("approval", "a", { x: 0, y: 0 }));
    const bad = propertySchema("approval").safeParse({
      ...base,
      config: { message: "Ship?", riskClass: "deploy" },
      onErrorMode: "goto",
    });
    expect(bad.error?.issues.map((i) => i.path.join("."))).toContain("onErrorTarget");
    const fork = toFormValues(makeNode("parallel_fork", "f", { x: 0, y: 0 }));
    expect(propertySchema("parallel_fork").parse(fork).config).toEqual({});
  });
});
