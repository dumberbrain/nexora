/**
 * Secret redaction (FR-052). Applied before anything is persisted, logged, emitted over the
 * socket, exported, or returned through MCP. Pure and idempotent: redact(redact(x)) == redact(x).
 */
export const REDACTED = "[REDACTED]";

const MAX_DEPTH = 32;

/** Object keys whose (scalar) value is always secret — compared without `_`/`-`, lowercase. */
const SENSITIVE_KEY_SUFFIXES = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "privatekey",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "sessionid",
];

export function isSensitiveKey(key: string): boolean {
  const k = key.replace(/[-_]/g, "").toLowerCase();
  return SENSITIVE_KEY_SUFFIXES.some((s) => k.endsWith(s));
}

const PEM = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

/** Provider token formats. Order matters: specific before generic. */
const TOKEN_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, // OpenAI
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub classic
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /\bnxr_[A-Za-z0-9_-]{32,}/g, // Nexora API token (US8)
];

/**
 * AWS secret access key (40 chars, no fixed prefix) after its well-known name, including the
 * whitespace-separated CLI form `aws configure set aws_secret_access_key <key>` that KEY_VALUE
 * (which needs `:`/`=`) does not see.
 */
const AWS_SECRET =
  /(\baws[_-]?secret[_-]?access[_-]?key["']?\s*[:=\s]\s*["']?)[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/gi;

/** `Bearer xyz` / `Basic xyz` → keep the scheme. */
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/g;

/** `scheme://user:password@host` → keep user and host. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)([^@\s]+)(@)/gi;

/**
 * `password=x`, `db_password: 'x'`, `--api_key=x`, `"client_secret":"x"`.
 * Double-quoted values keep their quotes (JSON stays valid); single-quoted/bare are replaced.
 */
const KEY_VALUE =
  /((?:^|[\s"'{,;?&(-])["']?[A-Za-z0-9_.-]*?(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)["']?\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^\s"',;&})]+))/gim;

/** `.env` style line `NAME=value` with a token-like, high-entropy value. */
const ENV_LINE = /^([A-Z][A-Z0-9_]*=)([A-Za-z0-9_+=-]{16,})$/gm;

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function looksRandom(value: string): boolean {
  return /[A-Za-z]/.test(value) && /\d/.test(value) && shannonEntropy(value) >= 3.5;
}

export function redactString(input: string): string {
  let out = input.replace(PEM, REDACTED);
  for (const re of TOKEN_PATTERNS) out = out.replace(re, REDACTED);
  out = out.replace(AWS_SECRET, `$1${REDACTED}`);
  out = out.replace(AUTH_SCHEME, `$1 ${REDACTED}`);
  out = out.replace(URL_CREDENTIALS, `$1${REDACTED}$3`);
  out = out.replace(KEY_VALUE, (_m, prefix: string, dq?: string) =>
    dq !== undefined ? `${prefix}"${REDACTED}"` : `${prefix}${REDACTED}`,
  );
  out = out.replace(ENV_LINE, (m, prefix: string, value: string) =>
    looksRandom(value) ? `${prefix}${REDACTED}` : m,
  );
  return out;
}

/** Deep, non-mutating redaction of any JSON-like value. */
export function redact(value: unknown): unknown {
  return redactValue(value, [], 0);
}

function redactValue(value: unknown, ancestors: object[], depth: number): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return undefined;
  if (ancestors.includes(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  const nextAncestors = [...ancestors, value];
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, nextAncestors, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (isSensitiveKey(key) && (typeof v === "string" || typeof v === "number")) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(v, nextAncestors, depth + 1);
    }
  }
  return out;
}
