import { queryOptions } from "@tanstack/react-query";

import { githubApi } from "./github.api";
import { GITHUB_CACHE, GITHUB_SLOW_CACHE, GITHUB_STATUS_CACHE, githubKeys } from "./query-keys";
import { type GithubListParams, type RepoCoords } from "../model/types";

export const githubStatusQuery = () =>
  queryOptions({
    queryKey: githubKeys.status(),
    queryFn: ({ signal }) => githubApi.status({ signal }),
    ...GITHUB_STATUS_CACHE,
  });

export const githubReposQuery = () =>
  queryOptions({
    queryKey: githubKeys.repos(),
    queryFn: ({ signal }) => githubApi.repos({ signal }),
    ...GITHUB_SLOW_CACHE,
  });

export const githubBranchesQuery = (r: RepoCoords) =>
  queryOptions({
    queryKey: githubKeys.branches(r),
    queryFn: ({ signal }) => githubApi.branches(r, { signal }),
    ...GITHUB_CACHE,
  });

export const githubCommitsQuery = (r: RepoCoords, params: GithubListParams = {}) =>
  queryOptions({
    queryKey: githubKeys.commits(r, params),
    queryFn: ({ signal }) => githubApi.commits(r, params, { signal }),
    ...GITHUB_CACHE,
  });

export const githubPullsQuery = (r: RepoCoords, params: GithubListParams = {}) =>
  queryOptions({
    queryKey: githubKeys.pulls(r, params),
    queryFn: ({ signal }) => githubApi.pulls(r, params, { signal }),
    ...GITHUB_CACHE,
  });

export const githubPullFilesQuery = (r: RepoCoords, number: number) =>
  queryOptions({
    queryKey: githubKeys.pullFiles(r, number),
    queryFn: ({ signal }) => githubApi.pullFiles(r, number, { signal }),
    ...GITHUB_SLOW_CACHE,
  });
