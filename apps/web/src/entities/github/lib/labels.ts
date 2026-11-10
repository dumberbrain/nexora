import { type GithubPull, type RepoCoords } from "../model/types";

export const REVIEW_STATUS_LABEL: Record<GithubPull["reviewStatus"], string> = {
  approved: "approved",
  changes_requested: "changes requested",
  commented: "commented",
  pending: "pending",
  none: "no reviews",
};

export const REVIEW_STATUS_TONE: Record<GithubPull["reviewStatus"], string> = {
  approved: "border-phosphor/60 text-phosphor",
  changes_requested: "border-destructive/60 text-destructive",
  commented: "border-status-completed/60 text-status-completed",
  pending: "border-status-paused/60 text-status-paused",
  none: "border-border text-muted-foreground",
};

/** "acme/ubuliera" — the repo picker value and URL search param. */
export const repoSlug = ({ owner, repo }: RepoCoords) => `${owner}/${repo}`;

/** Parse "owner/repo"; anything else is not a repo reference. */
export function parseRepoSlug(slug: string | undefined): RepoCoords | null {
  if (!slug) return null;
  const [owner, repo, ...rest] = slug.split("/");
  if (!owner || !repo || rest.length > 0) return null;
  return { owner, repo };
}

/** First line of a commit message (the subject). */
export const commitSubject = (message: string) => message.split("\n", 1)[0] ?? "";

export const shortSha = (sha: string) => sha.slice(0, 7);
