import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ConditionError,
  compileCondition,
  type ConditionScope,
} from "../../../src/modules/workflow-engine/condition-evaluator";

const scope: ConditionScope = {
  tests: { status: "completed", output: "42 passed, 0 failed" },
  lint: { status: "failed", output: null },
  "run-e2e": { status: "skipped", output: null },
};

const evaluate = (expr: string, s: ConditionScope = scope) => compileCondition(expr).evaluate(s);

describe("condition evaluator (T125)", () => {
  it("compares node status and output of finished nodes", () => {
    expect(evaluate('nodes.tests.status == "completed"')).toBe(true);
    expect(evaluate('nodes.lint.status != "completed"')).toBe(true);
    expect(evaluate('nodes.tests.status == "completed" && nodes.lint.status == "completed"')).toBe(
      false,
    );
    expect(evaluate('nodes.lint.status == "completed" || !(nodes.tests.output == null)')).toBe(
      true,
    );
    expect(evaluate('contains(nodes.tests.output, "0 failed")')).toBe(true);
    expect(evaluate('nodes["run-e2e"].status == "skipped"')).toBe(true);
    expect(evaluate("nodes.lint.output == null")).toBe(true);
  });

  it("uses strict equality without coercion and coerces the result to a boolean", () => {
    expect(evaluate('nodes.tests.status == 1 || "x"')).toBe(true);
    expect(evaluate("1 == '1'")).toBe(false);
    expect(evaluate("nodes.lint.output")).toBe(false);
  });

  it("lists the nodes an expression references", () => {
    expect([
      ...compileCondition('nodes.tests.status == "completed" && nodes["run-e2e"].output == null')
        .refs,
    ]).toEqual(["tests", "run-e2e"]);
  });

  it("rejects anything but nodes.<id>.status|output", () => {
    for (const expr of [
      "process.exit(1)",
      "globalThis",
      "constructor",
      'nodes.tests.constructor == "x"',
      "nodes.tests.__proto__",
      "nodes.tests",
      "nodes",
      'nodes.tests["status"] == "completed"',
      "nodes[x].status",
      "this.x",
      "[1, 2]",
      "a = 1",
      "nodes.tests.status.length",
      "eval('1')",
      'Function("return 1")()',
      "contains.call(1)",
      "(1, 2)",
      "1 ? 2 : 3",
      "1 | 2",
      "",
      "nodes.tests.status ==",
    ]) {
      expect(() => compileCondition(expr), expr).toThrow(ConditionError);
    }
  });

  it("only sees nodes that already finished", () => {
    const c = compileCondition('nodes.deploy.status == "completed"');
    expect(() => c.evaluate(scope)).toThrow(/deploy.*not finished/);
    // inherited object keys are never resolved
    expect(() => compileCondition('nodes.toString.status == "x"').evaluate({})).toThrow(
      ConditionError,
    );
  });

  it("never uses eval or the Function constructor", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../../src/modules/workflow-engine/condition-evaluator.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\beval\s*\(|new Function|Function\s*\(/);
  });
});
