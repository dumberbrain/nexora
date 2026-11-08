import { describe, expect, it } from "vitest";

import { formatRelative, fromDateTimeLocal, toDateTimeLocal } from "./format-time";

describe("formatRelative", () => {
  const now = 1_000_000_000;
  it.each([
    [now - 1000, "just now"],
    [now - 42_000, "42s ago"],
    [now - 5 * 60_000, "5m ago"],
    [now - 3 * 3_600_000, "3h ago"],
    [now - 2 * 86_400_000, "2d ago"],
    [now + 10_000, "just now"],
  ])("formats %d", (ts, expected) => {
    expect(formatRelative(ts, now)).toBe(expected);
  });
});

describe("datetime-local round trip", () => {
  it("keeps minute precision and rejects garbage", () => {
    const ts = new Date(2026, 10, 8, 14, 3).getTime();
    expect(fromDateTimeLocal(toDateTimeLocal(ts))).toBe(ts);
    expect(fromDateTimeLocal("")).toBeUndefined();
    expect(fromDateTimeLocal("nope")).toBeUndefined();
  });
});
