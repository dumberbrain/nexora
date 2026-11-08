import { TASK_STATUSES, type TaskStatus } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { AppError } from "../../../src/http/errors";
import {
  assertTaskTransition,
  canTransitionTask,
  isTerminalTask,
  topologicalOrder,
  validateDag,
} from "../../../src/modules/task-manager/task-state";

const ALLOWED: [TaskStatus, TaskStatus][] = [
  ["pending", "queued"],
  ["queued", "pending"],
  ["queued", "planning"],
  ["planning", "running"],
  ["running", "waiting_for_input"],
  ["running", "blocked"],
  ["running", "reviewing"],
  ["running", "failed"],
  ["running", "cancelled"],
  ["waiting_for_input", "running"],
  ["blocked", "running"],
  ["reviewing", "completed"],
  ["reviewing", "running"],
];
const TERMINAL: TaskStatus[] = ["completed", "failed", "cancelled"];

function code(fn: () => void): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof AppError ? err.code : "not-an-app-error";
  }
  return undefined;
}

describe("task transitions (data-model)", () => {
  it.each(ALLOWED)("allows %s → %s", (from, to) => {
    expect(canTransitionTask(from, to)).toBe(true);
  });

  it("every non-terminal state may be cancelled; terminal states are final", () => {
    for (const s of TASK_STATUSES.values) {
      expect(canTransitionTask(s, "cancelled")).toBe(!TERMINAL.includes(s));
      expect(isTerminalTask(s)).toBe(TERMINAL.includes(s));
    }
    for (const from of TERMINAL) {
      for (const to of TASK_STATUSES.values) expect(canTransitionTask(from, to)).toBe(false);
    }
  });

  it("rejects everything else with CONFLICT", () => {
    const allowed = new Set(ALLOWED.map(([a, b]) => `${a}>${b}`));
    for (const from of TASK_STATUSES.values) {
      for (const to of TASK_STATUSES.values) {
        if (allowed.has(`${from}>${to}`)) continue;
        if (to === "cancelled" && !TERMINAL.includes(from)) continue;
        expect(code(() => assertTaskTransition(from, to)), `${from} → ${to}`).toBe("CONFLICT");
      }
    }
  });

  it("failed tasks cannot be revived (a retry creates a new attempt instead)", () => {
    expect(canTransitionTask("failed", "queued")).toBe(false);
    expect(canTransitionTask("failed", "running")).toBe(false);
  });
});

describe("dependency DAG", () => {
  it("accepts a DAG and orders it topologically", () => {
    const nodes = [
      { id: "T-3", dependsOn: ["T-1", "T-2"] },
      { id: "T-1", dependsOn: [] },
      { id: "T-2", dependsOn: ["T-1"] },
    ];
    expect(() => validateDag(nodes)).not.toThrow();
    expect(topologicalOrder(nodes)).toEqual(["T-1", "T-2", "T-3"]);
  });

  it("rejects a cycle with VALIDATION_FAILED", () => {
    const nodes = [
      { id: "T-1", dependsOn: ["T-3"] },
      { id: "T-2", dependsOn: ["T-1"] },
      { id: "T-3", dependsOn: ["T-2"] },
    ];
    expect(code(() => validateDag(nodes))).toBe("VALIDATION_FAILED");
  });

  it("rejects self-dependencies, unknown dependencies and duplicate ids", () => {
    expect(code(() => validateDag([{ id: "T-1", dependsOn: ["T-1"] }]))).toBe("VALIDATION_FAILED");
    expect(code(() => validateDag([{ id: "T-1", dependsOn: ["T-9"] }]))).toBe("VALIDATION_FAILED");
    expect(
      code(() =>
        validateDag([
          { id: "T-1", dependsOn: [] },
          { id: "T-1", dependsOn: [] },
        ]),
      ),
    ).toBe("VALIDATION_FAILED");
  });
});
