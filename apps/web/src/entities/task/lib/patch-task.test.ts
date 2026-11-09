import { describe, expect, it } from "vitest";

import { patchExecutionTask } from "./patch-task";
import { planFixture } from "../../../../tests/msw/handlers";

const [t1, t2] = planFixture.items as [
  (typeof planFixture.items)[0],
  (typeof planFixture.items)[0],
];

describe("patchExecutionTask", () => {
  it("replaces a task with the same id in place", () => {
    const next = patchExecutionTask(planFixture, { ...t2, status: "cancelled" });
    expect(next?.items.map((t) => [t.id, t.status])).toEqual([
      ["T-1", "pending"],
      ["T-2", "cancelled"],
      ["T-3", "pending"],
    ]);
    expect(next?.conflicts).toBe(planFixture.conflicts);
  });

  it("appends a task it does not know (assigned task or a retry attempt)", () => {
    const retry = { ...t1, id: "T-9", attempt: 2, previousAttemptId: "T-1" };
    expect(patchExecutionTask(planFixture, retry)?.items.at(-1)).toEqual(retry);
  });

  it("leaves an uncached list alone", () => {
    expect(patchExecutionTask(undefined, t1)).toBeUndefined();
  });
});
