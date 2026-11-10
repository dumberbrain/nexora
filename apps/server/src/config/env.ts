import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export type NodeEnv = "development" | "production" | "test";

export interface NexoraEnv {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  /** true only when explicitly opted in AND a token is configured (FR-050) */
  remote: boolean;
  token: string | undefined;
  dataDir: string;
  /** base URL Claude Code hooks POST to (hook installer) */
  publicUrl: string;
  /** FakeRuntimeAdapter for E2E — only ever allowed with NODE_ENV=test */
  testFakeRuntime: boolean;
  /** event history retention in days (NEXORA_RETENTION_DAYS, default 30) */
  retentionDays: number;
}

interface EnvDeps {
  homedir: () => string;
  tmpdir: () => string;
  pid: number;
}

const defaultDeps: EnvDeps = { homedir, tmpdir, pid: process.pid };

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
export const MIN_TOKEN_LENGTH = 32;
export const DEFAULT_RETENTION_DAYS = 30;
/** Production serves API + SPA on 3022; in development the Rsbuild dev server owns 3022. */
const DEFAULT_PORT: Record<NodeEnv, number> = { production: 3022, test: 3022, development: 3023 };

const RawSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXORA_HOST: z.string().trim().min(1).optional(),
  NEXORA_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  NEXORA_REMOTE: z.enum(["0", "1"]).optional(),
  NEXORA_TOKEN: z.string().optional(),
  NEXORA_DATA_DIR: z.string().trim().min(1).optional(),
  NEXORA_PUBLIC_URL: z.url().optional(),
  NEXORA_TEST_FAKE_RUNTIME: z.enum(["0", "1"]).optional(),
  NEXORA_RETENTION_DAYS: z.coerce.number().int().min(1).max(36_500).optional(),
});

/**
 * Parse and validate configuration. Throws ConfigError with an actionable message instead of
 * starting in an unsafe state (loopback by default; remote needs opt-in + token).
 */
export function loadEnv(
  raw: Record<string, string | undefined> = process.env,
  deps: EnvDeps = defaultDeps,
): NexoraEnv {
  const parsed = RawSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid configuration — ${issues.join("; ")}`);
  }
  const e = parsed.data;
  const nodeEnv = e.NODE_ENV;
  const host = e.NEXORA_HOST ?? "127.0.0.1";
  const remoteRequested = e.NEXORA_REMOTE === "1";
  const token = e.NEXORA_TOKEN && e.NEXORA_TOKEN.length > 0 ? e.NEXORA_TOKEN : undefined;

  if (!LOOPBACK_HOSTS.has(host)) {
    if (!remoteRequested) {
      throw new ConfigError(
        `Refusing to bind to non-loopback host "${host}". Remote access is opt-in: set NEXORA_REMOTE=1 and NEXORA_TOKEN (≥ ${MIN_TOKEN_LENGTH} chars). Never expose Nexora directly to the public internet.`,
      );
    }
    if (!token) {
      throw new ConfigError(
        `NEXORA_REMOTE=1 requires NEXORA_TOKEN (≥ ${MIN_TOKEN_LENGTH} chars) for authentication.`,
      );
    }
  }
  if (token && token.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(`NEXORA_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`);
  }

  const testFakeRuntime = e.NEXORA_TEST_FAKE_RUNTIME === "1";
  if (testFakeRuntime && nodeEnv !== "test") {
    throw new ConfigError(
      "NEXORA_TEST_FAKE_RUNTIME=1 is only allowed with NODE_ENV=test (it must never reach production views).",
    );
  }

  const port = e.NEXORA_PORT ?? DEFAULT_PORT[nodeEnv];
  const dataDir =
    e.NEXORA_DATA_DIR ??
    (nodeEnv === "test"
      ? join(deps.tmpdir(), `nexora-test-${deps.pid}`)
      : join(deps.homedir(), ".nexora"));
  const publicUrl = (e.NEXORA_PUBLIC_URL ?? "http://127.0.0.1:3022").replace(/\/+$/, "");

  return {
    nodeEnv,
    host,
    port,
    remote: remoteRequested && token !== undefined,
    token,
    dataDir,
    publicUrl,
    testFakeRuntime,
    retentionDays: e.NEXORA_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS,
  };
}
