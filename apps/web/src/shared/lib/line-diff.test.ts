import { describe, expect, it } from "vitest";

import { diffLines } from "./line-diff";

describe("diffLines", () => {
  it("marks every line as added when there was no file", () => {
    expect(diffLines("", "a\nb")).toEqual([
      { kind: "add", text: "a" },
      { kind: "add", text: "b" },
    ]);
  });

  it("keeps common lines and shows the change in place", () => {
    expect(diffLines("{\n  x: 1\n}", "{\n  x: 1,\n  y: 2\n}")).toEqual([
      { kind: "same", text: "{" },
      { kind: "remove", text: "  x: 1" },
      { kind: "add", text: "  x: 1," },
      { kind: "add", text: "  y: 2" },
      { kind: "same", text: "}" },
    ]);
  });

  it("treats CRLF and LF alike", () => {
    expect(diffLines("a\r\nb", "a\nb").every((l) => l.kind === "same")).toBe(true);
  });

  it("lists removed trailing lines", () => {
    expect(diffLines("a\nb", "a")).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
    ]);
  });
});
