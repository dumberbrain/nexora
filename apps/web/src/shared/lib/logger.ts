import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold: Level = env.isDev ? "debug" : "warn";

/* eslint-disable no-console -- this module is the single sanctioned console sink */
const sinks: Record<Level, (...args: unknown[]) => void> = {
  debug: (...a) => console.debug(...a),
  info: (...a) => console.info(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};
/* eslint-enable no-console */

function log(level: Level, message: string, context?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[threshold]) return;
  sinks[level](`[ubuliera] ${message}`, ...(context ? [context] : []));
}

/** App logger — use instead of console.* (team standard). Debug/info are dropped in production. */
export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => log("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => log("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => log("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => log("error", m, c),
};
