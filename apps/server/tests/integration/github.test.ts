import {
  GithubBranchListSchema,
  GithubCommitListSchema,
  GithubPullFilesSchema,
  GithubPullListSchema,
  GithubRepoListSchema,
  GithubStatusSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../src/db/client";
import { createApp } from "../../src/http/app";
import { registerGithubRoutes } from "../../src/http/routes/github";
import { createLogger } from "../../src/lib/logger";
import { ProcessNotAllowedError, type RunResult } from "../../src/lib/process";
import {
  aggregateReviewStatus,
  createGithubService,
  parseGithubRemote,
} from "../../src/modules/github-integration/github.service";
import { type ProcessRunner } from "../../src/modules/github-integration/runner";
import { HOST, login, testEnv } from "../helpers/us1";

interface Call {
  cmd: string;
  args: string[];
  cwd: string | undefined;
}

const ok = (stdout: unknown): RunResult => ({
  exitCode: 0,
  stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
  stderr: "",
  truncated: false,
});
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: "", stderr, truncated: false });

const AUTH_OK = "github.com\n  ✓ Logged in to github.com account octocat (keyring)\n";
const PROJECTS = [
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", rootPath: "/work/app" },
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", rootPath: "/work/lib" },
  { id: "01ARZ3NDEKTSV4RRFFQ69G5FAX", rootPath: "/work/nogit" },
];
const REMOTES: Record<string, string> = {
  "/work/app": [
    "origin\thttps://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123456789AB@github.com/acme/app.git (fetch)",
    "origin\thttps://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123456789AB@github.com/acme/app.git (push)",
    "upstream\tgit@github.com:upstream-org/app (fetch)",
    "gitlab\thttps://gitlab.com/acme/app.git (fetch)",
  ].join("\n"),
  "/work/lib": "origin\tssh://git@github.com/acme/lib.js.git (fetch)\n",
};

const PULLS = [
  {
    number: 7,
    title: "Add feature",
    state: "open",
    draft: false,
    user: { login: "alice" },
    head: { ref: "feat/x" },
    base: { ref: "main" },
    merged_at: null,
    updated_at: "2026-11-01T10:00:00Z",
    html_url: "https://github.com/acme/app/pull/7",
    requested_reviewers: [],
  },
  {
    number: 8,
    title: "Fix bug",
    state: "closed",
    draft: true,
    user: null,
    head: { ref: "fix/y" },
    base: { ref: "main" },
    merged_at: "2026-11-02T10:00:00Z",
    updated_at: null,
    html_url: null,
    requested_reviewers: [{ login: "bob" }],
  },
];
const REVIEWS: Record<string, unknown[]> = {
  "7": [
    { user: { login: "bob" }, state: "CHANGES_REQUESTED" },
    { user: { login: "carol" }, state: "APPROVED" },
    { user: { login: "bob" }, state: "APPROVED" },
  ],
  "8": [],
};

let db: Db;
let calls: Call[];
let gh: "connected" | "not_installed" | "not_authenticated";
let app: ReturnType<typeof createApp>;
let auth: { cookie: string; csrf: string };

const run: ProcessRunner = (cmd, args, opts) => {
  calls.push({ cmd, args: [...args], cwd: opts?.cwd });
  if (cmd === "gh") {
    if (gh === "not_installed") return Promise.reject(new ProcessNotAllowedError("not found"));
    if (args[0] === "--version") return Promise.resolve(ok("gh version 2.63.0 (2024-11-27)"));
    if (args[0] === "auth")
      return Promise.resolve(gh === "connected" ? ok(AUTH_OK) : fail("not logged in"));
    expect(args.slice(0, 3)).toEqual(["api", "--method", "GET"]);
    const path = args[3] ?? "";
    const [route] = path.split("?");
    if (route === "repos/acme/app") return Promise.resolve(ok({ default_branch: "main" }));
    if (route === "repos/acme/app/branches")
      return Promise.resolve(
        ok([
          { name: "main", commit: { sha: "aaa" }, protected: true },
          { name: "dev", commit: { sha: "bbb" }, protected: false },
        ]),
      );
    if (route === "repos/acme/app/commits")
      return Promise.resolve(
        ok([
          {
            sha: "c1",
            html_url: "https://github.com/acme/app/commit/c1",
            commit: { message: "init token=supersecretvalue123", author: { name: "A", date: "d" } },
            author: { login: "alice" },
          },
        ]),
      );
    if (route === "repos/acme/app/pulls") return Promise.resolve(ok(PULLS));
    const m = /^repos\/acme\/app\/pulls\/(\d+)(\/files|\/reviews)?$/.exec(route ?? "");
    if (m?.[2] === "/reviews") return Promise.resolve(ok(REVIEWS[m[1] ?? ""] ?? []));
    if (m?.[2] === "/files")
      return Promise.resolve(
        ok([{ filename: "src/a.ts", status: "modified", additions: 3, deletions: 1 }]),
      );
    if (m) return Promise.resolve(ok(PULLS.find((p) => String(p.number) === m[1])));
    return Promise.resolve(fail("gh: Not Found (HTTP 404)"));
  }
  // git
  if (args[0] === "remote") {
    const out = REMOTES[opts?.cwd ?? ""];
    return out === undefined
      ? Promise.resolve(fail("not a git repository"))
      : Promise.resolve(ok(out));
  }
  if (args[0] === "for-each-ref") return Promise.resolve(ok("main\u0009aaa111\ndev\u0009bbb222\n"));
  if (args[0] === "symbolic-ref") return Promise.resolve(ok("origin/main\n"));
  if (args[0] === "log")
    return Promise.resolve(ok("c9\u001fBob\u001f2026-11-01T00:00:00Z\u001fLocal commit\u001e\n"));
  return Promise.resolve(fail("unexpected"));
};

beforeEach(async () => {
  db = openDb({ dataDir: ":memory:" });
  calls = [];
  gh = "connected";
  const github = createGithubService({ run, projects: { list: () => PROJECTS } });
  app = createApp({
    env: testEnv,
    db,
    startedAt: 0,
    logger: createLogger({ level: "silent" }),
    registerRoutes: (api) => registerGithubRoutes(api, { github }),
  });
  auth = await login(app);
});
afterEach(() => closeDb(db));

const get = (path: string) =>
  app.request(`/api/v1${path}`, { headers: { ...HOST, cookie: auth.cookie } });
const body = async (res: Response): Promise<unknown> => {
  expect(res.status).toBe(200);
  return res.json();
};
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe("parseGithubRemote", () => {
  it.each([
    ["https://github.com/acme/app.git", "acme/app"],
    ["https://github.com/acme/app", "acme/app"],
    ["https://user:pw@github.com/acme/app.git/", "acme/app"],
    ["git@github.com:acme/app.git", "acme/app"],
    ["ssh://git@github.com:22/acme/app.git", "acme/app"],
    ["git://github.com/acme/app.git", "acme/app"],
  ])("%s → %s", (url, expected) => {
    const r = parseGithubRemote(url);
    expect(r && `${r.owner}/${r.repo}`).toBe(expected);
  });
  it.each(["https://gitlab.com/acme/app.git", "https://github.com/acme", "github.com:../x", ""])(
    "rejects %s",
    (url) => expect(parseGithubRemote(url)).toBeNull(),
  );
});

describe("aggregateReviewStatus", () => {
  const r = (login: string, state: string) => ({ user: { login }, state });
  it("latest decision per reviewer wins", () => {
    expect(aggregateReviewStatus([r("a", "CHANGES_REQUESTED"), r("a", "APPROVED")], 0)).toBe(
      "approved",
    );
    expect(aggregateReviewStatus([r("a", "APPROVED"), r("b", "CHANGES_REQUESTED")], 0)).toBe(
      "changes_requested",
    );
    expect(aggregateReviewStatus([r("a", "APPROVED"), r("a", "COMMENTED")], 0)).toBe("approved");
    expect(aggregateReviewStatus([r("a", "APPROVED"), r("a", "DISMISSED")], 0)).toBe("none");
    expect(aggregateReviewStatus([r("a", "COMMENTED")], 0)).toBe("commented");
    expect(aggregateReviewStatus([], 2)).toBe("pending");
    expect(aggregateReviewStatus([], 0)).toBe("none");
  });
});

describe("GitHub routes (T147)", () => {
  it("GET /github/status", async () => {
    expect(GithubStatusSchema.parse(await body(await get("/github/status")))).toMatchObject({
      status: "connected",
      account: "octocat",
    });
  });

  it("GET /github/repos parses https/ssh remotes of registered projects, never leaking credentials", async () => {
    const res = await get("/github/repos");
    const text = JSON.stringify(await body(res));
    const list = GithubRepoListSchema.parse(JSON.parse(text));
    expect(list.items).toEqual([
      { owner: "acme", repo: "app", projectId: PROJECTS[0]?.id, remote: "origin" },
      { owner: "upstream-org", repo: "app", projectId: PROJECTS[0]?.id, remote: "upstream" },
      { owner: "acme", repo: "lib.js", projectId: PROJECTS[1]?.id, remote: "origin" },
    ]);
    expect(text).not.toContain("ghp_");
    const remoteCalls = calls.filter((c) => c.cmd === "git");
    expect(remoteCalls.map((c) => [c.args, c.cwd])).toEqual([
      [["remote", "-v"], "/work/app"],
      [["remote", "-v"], "/work/lib"],
      [["remote", "-v"], "/work/nogit"],
    ]);
  });

  it("branches via gh api with the default branch flagged", async () => {
    const list = GithubBranchListSchema.parse(
      await body(await get("/github/repos/acme/app/branches")),
    );
    expect(list).toEqual({
      source: "github",
      items: [
        { name: "main", sha: "aaa", protected: true, isDefault: true },
        { name: "dev", sha: "bbb", protected: false, isDefault: false },
      ],
    });
    for (const c of calls.filter((x) => x.cmd === "gh" && x.args[0] === "api")) {
      expect(c.args).toHaveLength(4);
      expect(c.args[2]).toBe("GET");
    }
  });

  it("commits via gh api, branch + limit passed as query, output redacted", async () => {
    const list = GithubCommitListSchema.parse(
      await body(await get("/github/repos/acme/app/commits?branch=feat/x&limit=5")),
    );
    expect(list.source).toBe("github");
    expect(list.items[0]).toMatchObject({ sha: "c1", author: "alice", date: "d" });
    expect(list.items[0]?.message).not.toContain("supersecretvalue123");
    const api = calls.find((c) => c.args[3]?.startsWith("repos/acme/app/commits"));
    expect(api?.args[3]).toBe("repos/acme/app/commits?per_page=5&sha=feat%2Fx");
  });

  it("pulls with aggregated review status and merged state", async () => {
    const list = GithubPullListSchema.parse(
      await body(await get("/github/repos/acme/app/pulls?state=all")),
    );
    expect(list.items).toEqual([
      {
        number: 7,
        title: "Add feature",
        state: "open",
        draft: false,
        author: "alice",
        head: "feat/x",
        base: "main",
        reviewStatus: "approved",
        updatedAt: "2026-11-01T10:00:00Z",
        url: "https://github.com/acme/app/pull/7",
      },
      expect.objectContaining({
        number: 8,
        state: "merged",
        author: null,
        reviewStatus: "pending",
      }),
    ]);
    expect(calls.some((c) => c.args[3] === "repos/acme/app/pulls?state=all&per_page=30")).toBe(
      true,
    );
  });

  it("pull files with the pull and its review status", async () => {
    const res = GithubPullFilesSchema.parse(
      await body(await get("/github/repos/acme/app/pulls/7/files")),
    );
    expect(res.pull).toMatchObject({ number: 7, reviewStatus: "approved" });
    expect(res.files).toEqual([
      { filename: "src/a.ts", status: "modified", additions: 3, deletions: 1 },
    ]);
  });

  it("falls back to local git for branches and commits when gh is not connected", async () => {
    gh = "not_authenticated";
    const branches = GithubBranchListSchema.parse(
      await body(await get("/github/repos/acme/app/branches")),
    );
    expect(branches).toEqual({
      source: "local_git",
      items: [
        { name: "main", sha: "aaa111", protected: null, isDefault: true },
        { name: "dev", sha: "bbb222", protected: null, isDefault: false },
      ],
    });
    const commits = GithubCommitListSchema.parse(
      await body(await get("/github/repos/acme/app/commits?branch=dev&limit=3")),
    );
    expect(commits).toEqual({
      source: "local_git",
      items: [
        {
          sha: "c9",
          message: "Local commit",
          author: "Bob",
          date: "2026-11-01T00:00:00Z",
          url: null,
        },
      ],
    });
    const log = calls.find((c) => c.cmd === "git" && c.args[0] === "log");
    expect(log?.cwd).toBe("/work/app");
    expect(log?.args).toContain("-n");
    expect(log?.args).toContain("3");
    expect(log?.args.slice(-2)).toEqual(["dev", "--"]);
    expect(calls.some((c) => c.cmd === "gh" && c.args[0] === "api")).toBe(false);
  });

  it("pulls need gh: 422 with the setup hint when not installed", async () => {
    gh = "not_installed";
    const res = await get("/github/repos/acme/app/pulls");
    expect(res.status).toBe(422);
    const err = (await res.json()) as { error: { code: string; details: unknown[] } };
    expect(err.error.code).toBe("CAPABILITY_UNSUPPORTED");
    expect(err.error.details).toEqual([
      { status: "not_installed", hint: "winget install --id GitHub.cli -e" },
    ]);
  });

  it("no gh and no local clone → 422", async () => {
    gh = "not_authenticated";
    expect((await get("/github/repos/someone/else/branches")).status).toBe(422);
  });

  it("validates owner, repo, branch, pull number and query", async () => {
    expect(await errorCode(await get("/github/repos/-bad/app/branches"))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await get("/github/repos/acme/..%2F..%2Fx/branches"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await errorCode(await get("/github/repos/acme/app/commits?branch=--output=x"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await errorCode(await get("/github/repos/acme/app/commits?branch=a..b"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await errorCode(await get("/github/repos/acme/app/pulls/0/files"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await errorCode(await get("/github/repos/acme/app/pulls?limit=1000"))).toBe(
      "VALIDATION_FAILED",
    );
    expect(calls.some((c) => c.args[0] === "api")).toBe(false);
  });

  it("gh 404 → NOT_FOUND", async () => {
    expect(await errorCode(await get("/github/repos/acme/missing/pulls"))).toBe("NOT_FOUND");
  });
});
