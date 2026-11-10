import { GITHUB_AUTH_HINT, GITHUB_INSTALL_HINT, type GithubStatus } from "@ubuliera/contracts";

import { type ProcessRunner } from "./runner";

const TIMEOUT_MS = 10_000;

const VERSION_RE = /gh version (\d+\.\d+\.\d+)/;
/** `Logged in to github.com account octocat (keyring)` (new) or `… as octocat (oauth_token)` (old) */
const ACCOUNT_RE = /Logged in to \S+ (?:account|as) ([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?=\s|$)/;

/**
 * GitHub CLI status (T144, R12): `gh --version`, then `gh auth status --hostname github.com`.
 * Read-only. The auth output (which can show a masked token) is parsed for the login only and
 * is never returned.
 */
export async function detectGithubStatus(run: ProcessRunner): Promise<GithubStatus> {
  let versionOut: string;
  try {
    const r = await run("gh", ["--version"], { allowNonZero: true, timeoutMs: TIMEOUT_MS });
    if (r.exitCode !== 0) return notInstalled();
    versionOut = r.stdout;
  } catch {
    return notInstalled();
  }
  const version = VERSION_RE.exec(versionOut)?.[1] ?? null;

  try {
    const r = await run("gh", ["auth", "status", "--hostname", "github.com"], {
      allowNonZero: true,
      timeoutMs: TIMEOUT_MS,
    });
    if (r.exitCode !== 0) return notAuthenticated(version);
    const account = ACCOUNT_RE.exec(`${r.stdout}\n${r.stderr}`)?.[1] ?? null;
    return { status: "connected", version, account, hint: null };
  } catch {
    return notAuthenticated(version);
  }
}

function notInstalled(): GithubStatus {
  return { status: "not_installed", version: null, account: null, hint: GITHUB_INSTALL_HINT };
}

function notAuthenticated(version: string | null): GithubStatus {
  return { status: "not_authenticated", version, account: null, hint: GITHUB_AUTH_HINT };
}
