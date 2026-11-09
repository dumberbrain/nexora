import { type GithubListParams, type RepoCoords } from "../model/types";

/**
 * Cache policy — GitHub (US7, read-only via `gh api` on the server, local git fallback)
 * owner:        US7 web
 * keys:         githubKeys.* (["github", ...]); status() and repos() are global; everything
 *               else lives under repo(coords) so switching repos never mixes caches
 * staleTime:    status 30 s (the user may install/sign in at any moment; "Check again"
 *               refetches it); repos 5 min; branches/commits/pulls 60 s; PR files 5 min
 * gcTime:       10 min
 * gating:       repo queries are only enabled while status() is `connected` — when gh is
 *               missing or signed out the page shows setup guidance and asks for nothing else
 * invalidation: none (read-only); realtime: none
 */
export const githubKeys = {
  all: ["github"] as const,
  status: () => [...githubKeys.all, "status"] as const,
  repos: () => [...githubKeys.all, "repos"] as const,
  repo: ({ owner, repo }: RepoCoords) => [...githubKeys.all, "repo", owner, repo] as const,
  branches: (r: RepoCoords) => [...githubKeys.repo(r), "branches"] as const,
  commits: (r: RepoCoords, params: GithubListParams) =>
    [...githubKeys.repo(r), "commits", params] as const,
  pulls: (r: RepoCoords, params: GithubListParams) =>
    [...githubKeys.repo(r), "pulls", params] as const,
  pullFiles: (r: RepoCoords, number: number) =>
    [...githubKeys.repo(r), "pull", number, "files"] as const,
};

export const GITHUB_STATUS_CACHE = { staleTime: 30_000, gcTime: 10 * 60_000 } as const;
export const GITHUB_CACHE = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;
export const GITHUB_SLOW_CACHE = { staleTime: 5 * 60_000, gcTime: 10 * 60_000 } as const;
