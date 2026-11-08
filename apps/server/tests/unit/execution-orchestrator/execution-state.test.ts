import { EXECUTION_STATUSES, type ExecutionStatus } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { AppError } from "../../../src/http/errors";
import {
  assertExecutionTransition,
  canTransitionExecution,
  isTerminalExecution,
} from "../../../src/modules/execution-orchestrator/execution-state";

const HAPPY: [ExecutionStatus, ExecutionStatus][] = [
  ["draft", "analyzing"],
  ["analyzing", "awaiting_mode"],
  ["awaiting_mode", "configuring"],
  ["configuring", "plan_ready"],
  ["plan_ready", "awaiting_approval"],
  ["awaiting_approval", "running"],
  ["running", "paused"],
  ["paused", "running"],
  ["running", "verifying"],
  ["verifying", "completed"],
  ["verifying", "failed"],
];

const TERMINAL: ExecutionStatus[] = ["completed", "failed", "cancelled"];

describe("execution state machine", () => {
  it.each(HAPPY)("allows %s → %s", (from, to) => {
    expect(canTransitionExecution(from, to)).toBe(true);
    expect(() => assertExecutionTransition(from, to)).not.toThrow();
  });

  it("allows cancelling from every non-terminal state", () => {
    for (const s of EXECUTION_STATUSES.values) {
      expect(canTransitionExecution(s, "cancelled")).toBe(!TERMINAL.includes(s));
    }
  });

  it("allows going back to configuring from plan_ready / awaiting_approval (re-plan)", () => {
    expect(canTransitionExecution("plan_ready", "configuring")).toBe(true);
    expect(canTransitionExecution("awaiting_approval", "configuring")).toBe(true);
  });

  it.each<[ExecutionStatus, ExecutionStatus]>([
    ["draft", "running"],
    ["analyzing", "plan_ready"],
    ["awaiting_mode", "running"],
    ["configuring", "running"],
    ["plan_ready", "running"],
    ["paused", "verifying"],
    ["running", "completed"],
    ["verifying", "running"],
    ["completed", "running"],
    ["failed", "running"],
    ["cancelled", "draft"],
  ])("rejects %s → %s with CONFLICT", (from, to) => {
    expect(canTransitionExecution(from, to)).toBe(false);
    try {
      assertExecutionTransition(from, to);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CONFLICT");
      expect((err as AppError).status).toBe(409);
    }
  });

  it("knows the terminal states and never leaves them", () => {
    for (const s of EXECUTION_STATUSES.values) {
      expect(isTerminalExecution(s)).toBe(TERMINAL.includes(s));
    }
    for (const from of TERMINAL) {
      for (const to of EXECUTION_STATUSES.values) expect(canTransitionExecution(from, to)).toBe(false);
    }
  });
});
