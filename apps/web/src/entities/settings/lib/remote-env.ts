/** Env vars that control remote access (FR-050) — read-only in the UI, set before starting. */
export const REMOTE_ENV_VARS = [
  { name: "NEXORA_REMOTE", hint: "set to 1 to allow a non-loopback bind" },
  { name: "NEXORA_HOST", hint: "bind address (default 127.0.0.1)" },
  { name: "NEXORA_PORT", hint: "listen port" },
  { name: "NEXORA_TOKEN", hint: "required with NEXORA_REMOTE=1, at least 32 characters" },
] as const;
