const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time — "just now", "42s ago", "5m ago", "3h ago", "2d ago". */
export function formatRelative(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 5 * SECOND) return "just now";
  if (diff < MINUTE) return `${Math.floor(diff / SECOND)}s ago`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Local wall-clock time with milliseconds — "14:03:07.120" (log lines). */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Local date + time — "2026-11-08 14:03:07". */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** epoch ms → `<input type="datetime-local">` value (local time, minute precision). */
export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `<input type="datetime-local">` value → epoch ms (undefined for empty/invalid). */
export function fromDateTimeLocal(value: string): number | undefined {
  if (!value) return undefined;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? undefined : ts;
}
