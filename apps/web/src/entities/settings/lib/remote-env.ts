/** Env vars that control remote access (FR-050) — read-only in the UI, set before starting. */
export const REMOTE_ENV_VARS = [
  { name: "UBULIERA_REMOTE", hint: "set to 1 to allow a non-loopback bind" },
  { name: "UBULIERA_HOST", hint: "bind address (default 127.0.0.1)" },
  { name: "UBULIERA_PORT", hint: "listen port" },
  { name: "UBULIERA_TOKEN", hint: "required with UBULIERA_REMOTE=1, at least 32 characters" },
] as const;
