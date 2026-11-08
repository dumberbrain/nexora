import { describe, expect, it } from "vitest";

import { csvCell, csvRow } from "../../../src/lib/csv";

describe("csv", () => {
  it("escapes separators, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(" padded")).toBe('" padded"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("neutralises spreadsheet formulas in strings", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "=HYPERLINK(1)"]) {
      expect(csvCell(s)).toBe(`'${s}`);
    }
    expect(csvCell("=a,b")).toBe(`"'=a,b"`);
    expect(csvCell(-5)).toBe("-5");
  });

  it("joins a row with CRLF", () => {
    expect(csvRow(["a", null, 1])).toBe("a,,1\r\n");
  });
});
