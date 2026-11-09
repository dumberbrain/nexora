import { http } from "@/shared/api";

import {
  type GithubBranchList,
  type GithubCommitList,
  type GithubListParams,
  type GithubPullFiles,
  type GithubPullList,
  type GithubRepoList,
  type GithubStatus,
  type RepoCoords,
} from "../model/types";

type Opts = { signal?: AbortSignal };

const repoPath = ({ owner, repo }: RepoCoords, sub: string) =>
  `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${sub}`;

/** Every call is a read-only GET; the server runs `gh api` / `git` with argument arrays. */
export const githubApi = {
  /** GET /github/status — connected | not_installed | not_authenticated + setup hint */
  status: (opts: Opts = {}) => http.get<GithubStatus>("/github/status", opts).then((r) => r.data),

  /** GET /github/repos — owner/repo of registered projects' remotes */
  repos: (opts: Opts = {}) => http.get<GithubRepoList>("/github/repos", opts).then((r) => r.data),

  branches: (r: RepoCoords, opts: Opts = {}) =>
    http.get<GithubBranchList>(repoPath(r, "/branches"), opts).then((res) => res.data),

  commits: (r: RepoCoords, params: GithubListParams, opts: Opts = {}) =>
    http
      .get<GithubCommitList>(repoPath(r, "/commits"), { ...opts, params })
      .then((res) => res.data),

  pulls: (r: RepoCoords, params: GithubListParams, opts: Opts = {}) =>
    http.get<GithubPullList>(repoPath(r, "/pulls"), { ...opts, params }).then((res) => res.data),

  /** GET /github/repos/:owner/:repo/pulls/:n/files — changed files + review status */
  pullFiles: (r: RepoCoords, number: number, opts: Opts = {}) =>
    http.get<GithubPullFiles>(repoPath(r, `/pulls/${number}/files`), opts).then((res) => res.data),
};
