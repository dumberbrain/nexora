import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { AGENT_TEAMS_FLAG } from "./environment";

export interface EnableAgentTeamsOutcome {
  /** absolute path of `<projectRoot>/.claude/settings.local.json` */
  settingsPath: string;
  /** false when the flag was already "1" (nothing written) */
  changed: boolean;
}

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Sets `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"` in the project's
 * `.claude/settings.local.json` (T138, FR-011). Every other key is preserved; a file that is not a
 * JSON object is never overwritten (the caller gets an error instead). The caller confirms and
 * audits — this function only merges and writes (atomically, via a temp file + rename).
 */
export async function enableAgentTeams(projectRoot: string): Promise<EnableAgentTeamsOutcome> {
  const dir = path.join(path.resolve(projectRoot), ".claude");
  const settingsPath = path.join(dir, "settings.local.json");
  let current: Bag = {};
  let raw: string | null = null;
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (raw !== null && raw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${settingsPath} is not valid JSON; fix it before enabling Agent Teams`);
    }
    if (!isBag(parsed)) throw new Error(`${settingsPath} must contain a JSON object`);
    current = parsed;
  }
  if (current.env !== undefined && !isBag(current.env)) {
    throw new Error(`${settingsPath}: "env" must be an object`);
  }
  const env: Bag = isBag(current.env) ? current.env : {};
  if (env[AGENT_TEAMS_FLAG] === "1") return { settingsPath, changed: false };

  const next = { ...current, env: { ...env, [AGENT_TEAMS_FLAG]: "1" } };
  await mkdir(dir, { recursive: true });
  const tmp = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tmp, settingsPath);
  return { settingsPath, changed: true };
}
