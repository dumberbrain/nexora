import { describe, expect, it } from "vitest";

import { decideMove, dragBlockedReason } from "./move-rule";

describe("move rule (Backlog ⇄ Todo only)", () => {
  it("maps Backlog ⇄ Todo drops to pending ⇄ queued", () => {
    expect(decideMove({ status: "pending" }, "todo")).toEqual({ kind: "move", status: "queued" });
    expect(decideMove({ status: "queued" }, "backlog")).toEqual({
      kind: "move",
      status: "pending",
    });
  });

  it("treats a drop on the card's own column as a no-op", () => {
    expect(decideMove({ status: "queued" }, "todo")).toEqual({ kind: "same" });
  });

  it("refuses every other column with a reason", () => {
    for (const to of ["in_progress", "review", "completed", "failed"] as const) {
      const d = decideMove({ status: "pending" }, to);
      expect(d.kind).toBe("refused");
      expect(d.kind === "refused" && d.reason).toMatch(/only backlog ⇄ todo/i);
    }
  });

  it("does not let agent-driven cards be picked up", () => {
    expect(dragBlockedReason({ status: "running" })).toMatch(/only backlog and todo/i);
    expect(dragBlockedReason({ status: "pending" })).toBeNull();
    expect(decideMove({ status: "reviewing" }, "todo").kind).toBe("refused");
  });
});
