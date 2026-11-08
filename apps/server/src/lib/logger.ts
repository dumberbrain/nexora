import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

import { redact, redactString } from "./redactor";

/**
 * Structured logger. Every log object AND message string goes through the redactor, so a
 * secret can never reach the log output (FR-052). Use this instead of console.*.
 */
export function createLogger(
  opts: { level?: string; destination?: DestinationStream } = {},
): Logger {
  const options: LoggerOptions = {
    level: opts.level ?? process.env.NEXORA_LOG_LEVEL ?? "info",
    base: { app: "nexora" },
    formatters: {
      log: (obj) => redact(obj) as Record<string, unknown>,
    },
    hooks: {
      logMethod(args, method) {
        const safe = args.map((a: unknown) => (typeof a === "string" ? redactString(a) : a));
        method.apply(this, safe as Parameters<typeof method>);
      },
    },
  };
  return opts.destination ? pino(options, opts.destination) : pino(options);
}

export const logger = createLogger();
export type { Logger };
