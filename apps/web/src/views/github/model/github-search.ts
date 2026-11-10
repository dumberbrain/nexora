import { type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { githubStatusQuery } from "@/entities/github";

/** /github search params; invalid values are dropped, not fatal. */
export const githubSearchSchema = z.object({
  /** "owner/repo" of a registered project's remote */
  repo: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .optional()
    .catch(undefined),
  branch: z.string().min(1).max(255).optional().catch(undefined),
  /** PR whose changed files are open */
  pull: z.coerce.number().int().min(1).optional().catch(undefined),
});
export type GithubSearch = z.infer<typeof githubSearchSchema>;

/** Drop keys whose value is undefined so URLs stay canonical. */
export function cleanGithubSearch(search: Record<string, unknown>): GithubSearch {
  return Object.fromEntries(Object.entries(search).filter(([, v]) => v !== undefined));
}

/**
 * Only the status is prefetched: repo data must not be requested until the view knows gh is
 * connected (not_installed / not_authenticated show setup guidance instead).
 * Not awaited: the status shells out to `gh auth status` (often > 1 s), so blocking the route on
 * it broke the ≤ 1 s navigation budget (SC-007) — the view shows its own loading state instead.
 */
export function loadGithub(qc: QueryClient): void {
  void qc.prefetchQuery(githubStatusQuery());
}
