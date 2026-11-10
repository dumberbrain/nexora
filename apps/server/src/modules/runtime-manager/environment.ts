import { readFileSync } from "node:fs";
import path from "node:path";

import { type RuntimeEnvironment } from "@ubuliera/contracts";

import { runCommand, type RunResult } from "../../lib/process";

export const AGENT_TEAMS_FLAG = "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS";

/** How Ubuliera asks the local `claude` CLI about itself — never a model call. */
export interface ClaudeProbe {
  /** `claude --version`; rejects when the CLI is missing */
  version(): Promise<string>;
  /** `claude auth status` (non-zero exit allowed) */
  authStatus(): Promise<Pick<RunResult, "exitCode" | "stdout" | "stderr">>;
}

export const cliClaudeProbe: ClaudeProbe = {
  version: async () => (await runCommand("claude", ["--version"], { timeoutMs: 15_000 })).stdout,
  authStatus: () =>
    runCommand("claude", ["auth", "status"], { timeoutMs: 15_000, allowNonZero: true }),
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function parseLoggedIn(stdout: string): boolean | null {
  try {
    const v = (JSON.parse(stdout) as { loggedIn?: unknown }).loggedIn;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

/** Claude Code installation + login state for GET /runtime/environment (T087). */
export async function detectClaude(
  probe: ClaudeProbe,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeEnvironment["claude"]> {
  let version: string;
  try {
    version = (await probe.version()).trim();
  } catch (err) {
    return {
      installed: false,
      version: null,
      authenticated: null,
      reason: `Claude Code CLI not found: ${errorText(err)}`,
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { installed: true, version: version || null, authenticated: true, reason: null };
  }
  try {
    const r = await probe.authStatus();
    const loggedIn = parseLoggedIn(r.stdout) ?? (r.exitCode === 0 ? true : null);
    return {
      installed: true,
      version: version || null,
      authenticated: loggedIn,
      reason:
        loggedIn === false
          ? "Claude Code is not logged in — run `claude auth login`"
          : loggedIn === null
            ? "Could not determine the login state"
            : null,
    };
  } catch {
    return {
      installed: true,
      version: version || null,
      authenticated: null,
      reason: "Could not determine the login state",
    };
  }
}

/** `env.<flag>` of a Claude settings file; unreadable or malformed files count as unset. */
function settingsFlag(file: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { env?: Record<string, unknown> };
    const v = parsed.env?.[AGENT_TEAMS_FLAG];
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Agent Teams availability (research R3): `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the process
 * environment, the user settings `env`, or a registered project's `.claude/settings(.local).json`.
 */
export function detectAgentTeams(opts: {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  projectRoots: readonly string[];
}): RuntimeEnvironment["agentTeams"] {
  if (opts.env[AGENT_TEAMS_FLAG] === "1") {
    return { enabled: true, detail: `${AGENT_TEAMS_FLAG}=1 is set in the environment` };
  }
  const files = [
    path.join(opts.homeDir, ".claude", "settings.json"),
    ...opts.projectRoots.flatMap((root) => [
      path.join(root, ".claude", "settings.json"),
      path.join(root, ".claude", "settings.local.json"),
    ]),
  ];
  const hit = files.find((f) => settingsFlag(f) === "1");
  if (hit) return { enabled: true, detail: `${AGENT_TEAMS_FLAG}=1 is set in ${hit}` };
  return {
    enabled: false,
    detail: `Set ${AGENT_TEAMS_FLAG}=1 — Ubuliera can add it to project settings after you confirm`,
  };
}
