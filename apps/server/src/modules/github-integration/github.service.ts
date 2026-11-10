import {
  type GithubBranch,
  type GithubBranchList,
  type GithubCommit,
  type GithubCommitList,
  type GithubListQuery,
  type GithubPull,
  type GithubPullFile,
  type GithubPullFiles,
  type GithubPullList,
  type GithubRepoList,
  type GithubRepoRef,
  type GithubStatus,
} from "@ubuliera/contracts";
import { z } from "zod";

import { detectGithubStatus } from "./gh-status";
import { defaultRunner, type ProcessRunner } from "./runner";
import { AppError } from "../../http/errors";
import { redact } from "../../lib/redactor";

/*
 * GitHub integration (T147, R12). Everything is read-only: `gh api --method GET <path>` and local
 * `git` reads, always as argument arrays through the allowlisted runner. Owner/repo/branch are
 * validated before they reach any argument, and every response passes the redactor.
 */

const GH_TIMEOUT_MS = 20_000;
const GIT_TIMEOUT_MS = 10_000;
const STATUS_TTL_MS = 30_000;
const REVIEW_CONCURRENCY = 4;

/* ---------- validation ---------- */

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidOwner(owner: string): boolean {
  return OWNER_RE.test(owner);
}
export function isValidRepo(repo: string): boolean {
  return REPO_RE.test(repo) && repo !== "." && repo !== "..";
}

/** Conservative git ref name: no option look-alikes, ranges, revision syntax or control chars. */
export function isValidBranch(branch: string): boolean {
  return (
    branch.length > 0 &&
    branch.length <= 255 &&
    /^[A-Za-z0-9._/-]+$/.test(branch) &&
    !branch.startsWith("-") &&
    !branch.startsWith("/") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.endsWith(".lock") &&
    !branch.includes("..") &&
    !branch.includes("//")
  );
}

function checkRepo(owner: string, repo: string): void {
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    throw new AppError("VALIDATION_FAILED", "Invalid owner/repo");
  }
}

/* ---------- remotes ---------- */

const HTTPISH =
  /^(?:https?|git|ssh):\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const SCP = /^(?:[A-Za-z0-9._-]+@)?github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

/** owner/repo of a GitHub remote URL (https, ssh://, git://, scp-like `git@github.com:o/r`). */
export function parseGithubRemote(url: string): { owner: string; repo: string } | null {
  const m = HTTPISH.exec(url.trim()) ?? SCP.exec(url.trim());
  if (!m?.[1] || !m[2]) return null;
  const [owner, repo] = [m[1], m[2]];
  return isValidOwner(owner) && isValidRepo(repo) ? { owner, repo } : null;
}

/* ---------- review aggregation ---------- */

export interface ReviewLike {
  user?: { login?: string | null | undefined } | null | undefined;
  state?: string | null | undefined;
}

/**
 * Latest decision per reviewer (APPROVED / CHANGES_REQUESTED; DISMISSED clears it; COMMENTED never
 * overrides a decision). Any changes requested wins, then approved, then commented, then pending
 * (reviewers requested but nobody reviewed yet).
 */
export function aggregateReviewStatus(
  reviews: readonly ReviewLike[],
  requestedReviewers: number,
): GithubPull["reviewStatus"] {
  const decision = new Map<string, "APPROVED" | "CHANGES_REQUESTED">();
  let commented = false;
  for (const r of reviews) {
    const who = r.user?.login ?? "";
    const state = (r.state ?? "").toUpperCase();
    if (state === "APPROVED" || state === "CHANGES_REQUESTED") decision.set(who, state);
    else if (state === "DISMISSED") decision.delete(who);
    else if (state === "COMMENTED") commented = true;
  }
  const states = [...decision.values()];
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (states.includes("APPROVED")) return "approved";
  if (commented) return "commented";
  return requestedReviewers > 0 ? "pending" : "none";
}

/* ---------- gh api payloads ---------- */

const RepoSchema = z.looseObject({ default_branch: z.string().nullish() });
const BranchesSchema = z.array(
  z.looseObject({
    name: z.string().min(1),
    commit: z.looseObject({ sha: z.string().min(1) }),
    protected: z.boolean().nullish(),
  }),
);
const CommitsSchema = z.array(
  z.looseObject({
    sha: z.string().min(1),
    html_url: z.string().nullish(),
    commit: z.looseObject({
      message: z.string().nullish(),
      author: z.looseObject({ name: z.string().nullish(), date: z.string().nullish() }).nullish(),
    }),
    author: z.looseObject({ login: z.string().nullish() }).nullish(),
  }),
);
const PullSchema = z.looseObject({
  number: z.number().int().min(1),
  title: z.string().nullish(),
  state: z.string(),
  draft: z.boolean().nullish(),
  user: z.looseObject({ login: z.string().nullish() }).nullish(),
  head: z.looseObject({ ref: z.string() }),
  base: z.looseObject({ ref: z.string() }),
  merged_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  html_url: z.string().nullish(),
  requested_reviewers: z.array(z.unknown()).nullish(),
});
const ReviewsSchema = z.array(
  z.looseObject({
    user: z.looseObject({ login: z.string().nullish() }).nullish(),
    state: z.string().nullish(),
  }),
);
const FilesSchema = z.array(
  z.looseObject({
    filename: z.string().min(1),
    status: z.string().nullish(),
    additions: z.number().int().nonnegative().nullish(),
    deletions: z.number().int().nonnegative().nullish(),
  }),
);

/* ---------- service ---------- */

export interface ProjectRoots {
  list(): readonly { id: string; rootPath: string }[];
}

export interface GithubServiceDeps {
  run?: ProcessRunner;
  projects: ProjectRoots;
  now?: () => number;
}

interface LocalRemote {
  owner: string;
  repo: string;
  projectId: string;
  remote: string;
  rootPath: string;
}

export class GithubService {
  private readonly run: ProcessRunner;
  private readonly now: () => number;
  private statusCache: { at: number; value: Promise<GithubStatus> } | null = null;

  constructor(private readonly deps: GithubServiceDeps) {
    this.run = deps.run ?? defaultRunner;
    this.now = deps.now ?? Date.now;
  }

  /** gh status, cached briefly so every list request does not spawn `gh` twice */
  status(): Promise<GithubStatus> {
    const now = this.now();
    if (this.statusCache && now - this.statusCache.at < STATUS_TTL_MS) {
      return this.statusCache.value;
    }
    const value = detectGithubStatus(this.run);
    this.statusCache = { at: now, value };
    return value;
  }

  async repos(): Promise<GithubRepoList> {
    const items: GithubRepoRef[] = (await this.localRemotes()).map(
      ({ owner, repo, projectId, remote }) => ({ owner, repo, projectId, remote }),
    );
    return clean({ items });
  }

  async branches(owner: string, repo: string): Promise<GithubBranchList> {
    checkRepo(owner, repo);
    const fromGh = await this.tryGh(async () => {
      const [meta, list] = await Promise.all([
        this.api(`repos/${owner}/${repo}`, RepoSchema),
        this.api(`repos/${owner}/${repo}/branches?per_page=100`, BranchesSchema),
      ]);
      return list.map((b): GithubBranch => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected ?? null,
        isDefault: b.name === meta.default_branch,
      }));
    });
    if (fromGh) return clean({ source: "github", items: fromGh });
    const local = await this.localClone(owner, repo);
    return clean({ source: "local_git", items: await this.localBranches(local.rootPath) });
  }

  async commits(owner: string, repo: string, q: GithubListQuery): Promise<GithubCommitList> {
    checkRepo(owner, repo);
    if (q.branch !== undefined && !isValidBranch(q.branch)) {
      throw new AppError("VALIDATION_FAILED", "Invalid branch name");
    }
    const fromGh = await this.tryGh(async () => {
      const sha = q.branch ? `&sha=${encodeURIComponent(q.branch)}` : "";
      const list = await this.api(
        `repos/${owner}/${repo}/commits?per_page=${q.limit}${sha}`,
        CommitsSchema,
      );
      return list.map((c): GithubCommit => ({
        sha: c.sha,
        message: (c.commit.message ?? "").slice(0, 5000),
        author: c.author?.login ?? c.commit.author?.name ?? null,
        date: c.commit.author?.date ?? null,
        url: c.html_url ?? null,
      }));
    });
    if (fromGh) return clean({ source: "github", items: fromGh });
    const local = await this.localClone(owner, repo);
    return clean({
      source: "local_git",
      items: await this.localCommits(local.rootPath, q.branch, q.limit),
    });
  }

  async pulls(owner: string, repo: string, q: GithubListQuery): Promise<GithubPullList> {
    checkRepo(owner, repo);
    await this.requireGh();
    const list = await this.api(
      `repos/${owner}/${repo}/pulls?state=${q.state}&per_page=${q.limit}`,
      z.array(PullSchema),
    );
    const items = await mapLimit(list, REVIEW_CONCURRENCY, (p) => this.toPull(owner, repo, p));
    return clean({ items });
  }

  async pullFiles(owner: string, repo: string, n: number): Promise<GithubPullFiles> {
    checkRepo(owner, repo);
    if (!Number.isInteger(n) || n < 1)
      throw new AppError("VALIDATION_FAILED", "Invalid pull number");
    await this.requireGh();
    const [raw, files] = await Promise.all([
      this.api(`repos/${owner}/${repo}/pulls/${n}`, PullSchema),
      this.api(`repos/${owner}/${repo}/pulls/${n}/files?per_page=100`, FilesSchema),
    ]);
    return clean({
      pull: await this.toPull(owner, repo, raw),
      files: files.map((f): GithubPullFile => ({
        filename: f.filename,
        status: (f.status ?? "modified").slice(0, 32),
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
      })),
    });
  }

  /* ---------- internals ---------- */

  private async toPull(
    owner: string,
    repo: string,
    p: z.infer<typeof PullSchema>,
  ): Promise<GithubPull> {
    const reviews = await this.api(
      `repos/${owner}/${repo}/pulls/${p.number}/reviews?per_page=100`,
      ReviewsSchema,
    );
    return {
      number: p.number,
      title: (p.title ?? "").slice(0, 1000),
      state: p.merged_at ? "merged" : p.state === "open" ? "open" : "closed",
      draft: p.draft ?? false,
      author: p.user?.login ?? null,
      head: p.head.ref,
      base: p.base.ref,
      reviewStatus: aggregateReviewStatus(reviews, p.requested_reviewers?.length ?? 0),
      updatedAt: p.updated_at ?? null,
      url: p.html_url ?? null,
    };
  }

  private async requireGh(): Promise<void> {
    const s = await this.status();
    if (s.status !== "connected") {
      throw new AppError(
        "CAPABILITY_UNSUPPORTED",
        "GitHub CLI is not connected; pull requests need `gh`",
        [{ status: s.status, hint: s.hint }],
      );
    }
  }

  /** gh result, or null when gh is not connected or the call failed (caller falls back) */
  private async tryGh<T>(fn: () => Promise<T>): Promise<T | null> {
    if ((await this.status()).status !== "connected") return null;
    try {
      return await fn();
    } catch (err) {
      // a missing repo on GitHub may still exist as a local clone
      if (err instanceof AppError && err.code !== "NOT_FOUND") throw err;
      return null;
    }
  }

  /** `gh api --method GET <path>` parsed with `schema`; 404 → NOT_FOUND */
  private async api<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const r = await this.run("gh", ["api", "--method", "GET", path], {
      allowNonZero: true,
      timeoutMs: GH_TIMEOUT_MS,
    });
    if (r.exitCode !== 0) {
      if (/HTTP 404|Not Found/i.test(r.stderr)) {
        throw new AppError("NOT_FOUND", "Not found on GitHub");
      }
      throw new Error(`gh api failed (exit ${r.exitCode})`);
    }
    let json: unknown;
    try {
      json = JSON.parse(r.stdout) as unknown;
    } catch {
      throw new Error("gh api returned invalid JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Error("gh api returned an unexpected payload");
    return parsed.data;
  }

  private async localRemotes(): Promise<LocalRemote[]> {
    const out: LocalRemote[] = [];
    for (const p of this.deps.projects.list()) {
      let stdout: string;
      try {
        const r = await this.run("git", ["remote", "-v"], {
          cwd: p.rootPath,
          allowNonZero: true,
          timeoutMs: GIT_TIMEOUT_MS,
        });
        if (r.exitCode !== 0) continue;
        stdout = r.stdout;
      } catch {
        continue;
      }
      for (const line of stdout.split(/\r?\n/)) {
        const [remote, url] = line.split(/\s+/);
        if (!remote || !url) continue;
        const parsed = parseGithubRemote(url);
        if (!parsed) continue;
        const dup = out.some(
          (o) =>
            o.projectId === p.id &&
            o.remote === remote &&
            o.owner === parsed.owner &&
            o.repo === parsed.repo,
        );
        if (!dup) out.push({ ...parsed, projectId: p.id, remote, rootPath: p.rootPath });
      }
    }
    return out;
  }

  /** a registered project with this GitHub remote, or 422 with the gh setup hint */
  private async localClone(owner: string, repo: string): Promise<LocalRemote> {
    const lc = (s: string) => s.toLowerCase();
    const hit = (await this.localRemotes()).find(
      (r) => lc(r.owner) === lc(owner) && lc(r.repo) === lc(repo),
    );
    if (hit) return hit;
    const s = await this.status();
    throw new AppError(
      "CAPABILITY_UNSUPPORTED",
      "GitHub CLI is not connected and no registered project has this GitHub remote",
      [{ status: s.status, hint: s.hint }],
    );
  }

  private async git(cwd: string, args: string[]): Promise<string | null> {
    try {
      const r = await this.run("git", args, { cwd, allowNonZero: true, timeoutMs: GIT_TIMEOUT_MS });
      return r.exitCode === 0 ? r.stdout : null;
    } catch {
      return null;
    }
  }

  private async localBranches(cwd: string): Promise<GithubBranch[]> {
    const [refs, head] = await Promise.all([
      this.git(cwd, ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads"]),
      this.git(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
    ]);
    const def = head?.trim().replace(/^origin\//, "") || null;
    const items = (refs ?? "")
      .split(/\r?\n/)
      .map((l) => l.split("\t"))
      .filter((parts): parts is [string, string] => Boolean(parts[0] && parts[1]))
      .map(([name, sha]) => ({ name, sha, protected: null, isDefault: false }));
    const fallback = def ?? items.find((b) => b.name === "main" || b.name === "master")?.name;
    return items.map((b) => ({ ...b, isDefault: b.name === fallback }));
  }

  private async localCommits(
    cwd: string,
    branch: string | undefined,
    limit: number,
  ): Promise<GithubCommit[]> {
    const args = ["log", "-n", String(limit), "--format=%H%x1f%an%x1f%aI%x1f%s%x1e"];
    // validated by isValidBranch (never starts with "-"); "--" ends revisions
    if (branch) args.push(branch);
    args.push("--");
    const out = await this.git(cwd, args);
    if (out === null) throw new AppError("NOT_FOUND", "Branch not found in the local clone");
    return out
      .split("\u001e")
      .map((rec) => rec.trim())
      .filter(Boolean)
      .map((rec) => {
        const [sha = "", author = "", date = "", message = ""] = rec.split("\u001f");
        return {
          sha,
          message: message.slice(0, 5000),
          author: author || null,
          date: date || null,
          url: null,
        };
      })
      .filter((c) => c.sha.length > 0);
  }
}

/** Every outgoing GitHub payload passes the redactor (commit messages, titles, …). */
function clean<T>(value: T): T {
  return redact(value) as T;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function createGithubService(deps: GithubServiceDeps): GithubService {
  return new GithubService(deps);
}
