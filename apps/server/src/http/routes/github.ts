import {
  type GithubBranchList,
  type GithubCommitList,
  GithubListQuerySchema,
  type GithubPullFiles,
  type GithubPullList,
  type GithubRepoList,
  type GithubStatus,
} from "@ubuliera/contracts";
import { type Hono } from "hono";
import { z } from "zod";

import { type GithubService } from "../../modules/github-integration/github.service";
import { type AppBindings } from "../context";

export interface GithubRouteDeps {
  github: Pick<GithubService, "status" | "repos" | "branches" | "commits" | "pulls" | "pullFiles">;
}

const PullNumberSchema = z.coerce.number().int().min(1).max(1_000_000_000);

/**
 * US7 GitHub (T147, contracts/rest-api.md → Integrations & GitHub). Read-only: `gh api` GETs and
 * local `git` reads; owner/repo/branch are validated by the service before any process runs.
 */
export function registerGithubRoutes(api: Hono<AppBindings>, deps: GithubRouteDeps): void {
  const { github } = deps;

  api.get("/github/status", async (c) => c.json<GithubStatus>(await github.status()));

  api.get("/github/repos", async (c) => c.json<GithubRepoList>(await github.repos()));

  api.get("/github/repos/:owner/:repo/branches", async (c) =>
    c.json<GithubBranchList>(await github.branches(c.req.param("owner"), c.req.param("repo"))),
  );

  api.get("/github/repos/:owner/:repo/commits", async (c) => {
    const q = GithubListQuerySchema.parse(c.req.query());
    return c.json<GithubCommitList>(
      await github.commits(c.req.param("owner"), c.req.param("repo"), q),
    );
  });

  api.get("/github/repos/:owner/:repo/pulls", async (c) => {
    const q = GithubListQuerySchema.parse(c.req.query());
    return c.json<GithubPullList>(await github.pulls(c.req.param("owner"), c.req.param("repo"), q));
  });

  api.get("/github/repos/:owner/:repo/pulls/:n/files", async (c) => {
    const n = PullNumberSchema.parse(c.req.param("n"));
    return c.json<GithubPullFiles>(
      await github.pullFiles(c.req.param("owner"), c.req.param("repo"), n),
    );
  });
}
