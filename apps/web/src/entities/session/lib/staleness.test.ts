import { describe, expect, it } from "vitest";

import { STALE_AFTER_MS, sessionStaleReason } from "./staleness";

const now = 10_000_000;

describe("sessionStaleReason", () => {
  it("is fresh for a recently active session on a live link", () => {
    expect(
      sessionStaleReason({ status: "running", lastActivityAt: now - 1000 }, now, "connected"),
    ).toBeNull();
  });

  it("flags a running session that went quiet", () => {
    const reason = sessionStaleReason(
      { status: "running", lastActivityAt: now - STALE_AFTER_MS - 60_000 },
      now,
      "connected",
    );
    expect(reason).toMatch(/no events for 6 min while running/);
  });

  it("does not flag finished sessions for being quiet", () => {
    expect(
      sessionStaleReason({ status: "stopped", lastActivityAt: 0 }, now, "connected"),
    ).toBeNull();
  });

  it("flags every row while realtime is not connected", () => {
    expect(
      sessionStaleReason({ status: "idle", lastActivityAt: now }, now, "reconnecting"),
    ).toMatch(/realtime link reconnecting/);
  });
});
