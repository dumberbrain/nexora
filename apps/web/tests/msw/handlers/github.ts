import {
  GITHUB_AUTH_HINT,
  GITHUB_INSTALL_HINT,
  type GithubBranchList,
  type GithubCommitList,
  type GithubPull,
  type GithubPullFiles,
  type GithubPullList,
  type GithubRepoList,
  type GithubStatus,
} from "@nexora/contracts";
import { http, HttpResponse } from "msw";

const P1 = "01JCXK0000000000000000P001";
const P2 = "01JCXK0000000000000000P002";

export const githubStatusFixtures = {
  connected: { status: "connected", version: "2.83.0", account: "octo-dev", hint: null },
  notInstalled: {
    status: "not_installed",
    version: null,
    account: null,
    hint: GITHUB_INSTALL_HINT,
  },
  notAuthenticated: {
    status: "not_authenticated",
    version: "2.83.0",
    account: null,
    hint: GITHUB_AUTH_HINT,
  },
} satisfies Record<string, GithubStatus>;

export const githubRepoFixtures: GithubRepoList = {
  items: [
    { owner: "acme", repo: "nexora", projectId: P1, remote: "https://github.com/acme/nexora.git" },
    {
      owner: "acme",
      repo: "billing-api",
      projectId: P2,
      remote: "git@github.com:acme/billing-api",
    },
  ],
};

export const githubBranchFixtures: GithubBranchList = {
  source: "github",
  items: [
    { name: "main", sha: "a1b2c3d4e5f6", protected: true, isDefault: true },
    { name: "feat/us7-web", sha: "0f9e8d7c6b5a", protected: false, isDefault: false },
  ],
};

export const githubCommitFixtures: GithubCommitList = {
  source: "github",
  items: [
    {
      sha: "a1b2c3d4e5f6a7b8",
      message: "feat(web): integrations view\n\nLong body",
      author: "octo-dev",
      date: "2026-11-09T10:00:00Z",
      url: "https://github.com/acme/nexora/commit/a1b2c3d",
    },
  ],
};

const pull = (n: number, over: Partial<GithubPull>): GithubPull => ({
  number: n,
  title: `PR ${n}`,
  state: "open",
  draft: false,
  author: "octo-dev",
  head: "feat/x",
  base: "main",
  reviewStatus: "none",
  updatedAt: "2026-11-09T11:00:00Z",
  url: `https://github.com/acme/nexora/pull/${n}`,
  ...over,
});

export const githubPullFixtures: GithubPullList = {
  items: [
    pull(12, { title: "Add integrations inventory", reviewStatus: "approved" }),
    pull(13, { title: "GitHub view", reviewStatus: "changes_requested", draft: true }),
  ],
};

export const githubPullFilesFixture: GithubPullFiles = {
  pull: githubPullFixtures.items[0]!,
  files: [
    {
      filename: "apps/web/src/views/integrations/index.ts",
      status: "added",
      additions: 4,
      deletions: 0,
    },
    { filename: "README.md", status: "modified", additions: 2, deletions: 1 },
  ],
};

const REPO = "*/api/v1/github/repos/:owner/:repo";

export const githubHandlers = [
  http.get("*/api/v1/github/status", () =>
    HttpResponse.json<GithubStatus>(githubStatusFixtures.connected),
  ),
  http.get("*/api/v1/github/repos", () => HttpResponse.json<GithubRepoList>(githubRepoFixtures)),
  http.get(`${REPO}/branches`, () => HttpResponse.json<GithubBranchList>(githubBranchFixtures)),
  http.get(`${REPO}/commits`, () => HttpResponse.json<GithubCommitList>(githubCommitFixtures)),
  http.get(`${REPO}/pulls`, () => HttpResponse.json<GithubPullList>(githubPullFixtures)),
  http.get(`${REPO}/pulls/:n/files`, ({ params }) => {
    const n = Number(params.n);
    const match = githubPullFixtures.items.find((p) => p.number === n);
    if (!match) return HttpResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    return HttpResponse.json<GithubPullFiles>({ ...githubPullFilesFixture, pull: match });
  }),
];
