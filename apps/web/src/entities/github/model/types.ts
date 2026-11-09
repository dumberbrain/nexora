export type {
  GithubBranch,
  GithubBranchList,
  GithubCommit,
  GithubCommitList,
  GithubListQuery,
  GithubPull,
  GithubPullFile,
  GithubPullFiles,
  GithubPullList,
  GithubRepoList,
  GithubRepoRef,
  GithubStatus,
} from "@nexora/contracts";

/** A repository as the web addresses it: GitHub owner + repo name. */
export interface RepoCoords {
  owner: string;
  repo: string;
}

/** Query of the commits / pulls lists (defaults applied by the server). */
export interface GithubListParams {
  branch?: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}
