/** Leading characters spreadsheets treat as a formula (CSV/formula injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One RFC 4180 cell. Strings that a spreadsheet would evaluate as a formula get a leading `'`;
 * cells with separators, quotes, line breaks or edge spaces are quoted.
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: readonly CsvValue[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}
