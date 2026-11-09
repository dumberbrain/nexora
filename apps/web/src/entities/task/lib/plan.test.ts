import { describe, expect, it } from "vitest";

import { conflictsByTask, riskyTasks } from "./plan";
import { planFixture } from "../../../../tests/msw/handlers";

describe("plan helpers", () => {
  it("riskyTasks keeps every task whose risk class is not normal", () => {
    expect(riskyTasks(planFixture.items).map((t) => t.id)).toEqual(["T-2", "T-3"]);
  });

  it("conflictsByTask indexes each conflict under both task ids", () => {
    const map = conflictsByTask(planFixture.conflicts);
    expect(map.get("T-1")).toHaveLength(1);
    expect(map.get("T-3")).toEqual(map.get("T-1"));
    expect(map.has("T-2")).toBe(false);
  });
});
