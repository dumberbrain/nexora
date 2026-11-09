import { z } from "zod";

import { IntegrationSchema } from "../entities/integration";
import { EpochMsSchema, UlidSchema } from "../primitives";

/*
 * US7 — integrations inventory and GitHub (contracts/rest-api.md "Integrations & GitHub").
 * Everything here is read-only. MCP `env`/`headers` values and any token never leave the server
 * (FR-052); only their key names / counts may appear in `metadata`.
 */

/* ---------- integrations ---------- */

/** GET /integrations?projectId=&kind=&refresh= */
export const IntegrationListQuerySchema = z.object({
  projectId: UlidSchema.optional(),
  kind: IntegrationSchema.shape.kind.optional(),
  /** re-run discovery + health checks instead of serving the cached inventory */
  refresh: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type IntegrationListQuery = z.infer<typeof IntegrationListQuerySchema>;

/** One MCP tool as reported by a reachable server (name + description only). */
export const McpToolSummarySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  permissionStatus: IntegrationSchema.shape.permissionStatus,
});
export type McpToolSummary = z.infer<typeof McpToolSummarySchema>;

/**
 * Integration with typed details per kind. `metadata` stays free-form (e.g. skill description,
 * agent tools, MCP transport/command name, env key names) but is always redacted.
 */
export const IntegrationItemSchema = IntegrationSchema.extend({
  description: z.string().max(2000).nullable(),
  /** MCP servers only: tools listed by the server when reachable, else [] */
  tools: z.array(McpToolSummarySchema).default([]),
  /** why health is not ok / unknown, e.g. "timed out after 5 s", "http transport not checked" */
  healthDetail: z.string().max(500).nullable(),
  checkedAt: EpochMsSchema.nullable(),
});
export type IntegrationItem = z.infer<typeof IntegrationItemSchema>;

export const IntegrationListSchema = z.object({
  items: z.array(IntegrationItemSchema),
  /** when discovery last ran for this scope */
  discoveredAt: EpochMsSchema.nullable(),
});
export type IntegrationList = z.infer<typeof IntegrationListSchema>;

/* ---------- GitHub ---------- */

export const GITHUB_INSTALL_HINT = "winget install --id GitHub.cli -e";
export const GITHUB_AUTH_HINT = "gh auth login";

/** GET /github/status */
export const GithubStatusSchema = z.object({
  status: z.enum(["connected", "not_installed", "not_authenticated"]),
  /** gh version when installed */
  version: z.string().nullable(),
  /** account login when connected */
  account: z.string().nullable(),
  /** setup command for the user (GITHUB_INSTALL_HINT / GITHUB_AUTH_HINT), null when connected */
  hint: z.string().nullable(),
});
export type GithubStatus = z.infer<typeof GithubStatusSchema>;

/** owner/repo pairs parsed from registered projects' git remotes (repo picker). */
export const GithubRepoRefSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  projectId: UlidSchema,
  remote: z.string().min(1),
});
export type GithubRepoRef = z.infer<typeof GithubRepoRefSchema>;

/** GET /github/repos — repos of registered projects */
export const GithubRepoListSchema = z.object({ items: z.array(GithubRepoRefSchema) });
export type GithubRepoList = z.infer<typeof GithubRepoListSchema>;

/** Where a list came from: `gh api`, or local `git` when gh is unavailable (branches/commits). */
export const GithubSourceSchema = z.enum(["github", "local_git"]);

export const GithubBranchSchema = z.object({
  name: z.string().min(1),
  sha: z.string().min(1),
  protected: z.boolean().nullable(),
  isDefault: z.boolean(),
});
export type GithubBranch = z.infer<typeof GithubBranchSchema>;

export const GithubCommitSchema = z.object({
  sha: z.string().min(1),
  message: z.string().max(5000),
  author: z.string().nullable(),
  date: z.string().nullable(),
  url: z.string().nullable(),
});
export type GithubCommit = z.infer<typeof GithubCommitSchema>;

export const GithubPullSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().max(1000),
  state: z.enum(["open", "closed", "merged"]),
  draft: z.boolean(),
  author: z.string().nullable(),
  head: z.string(),
  base: z.string(),
  /** aggregated from reviews: latest decision per reviewer */
  reviewStatus: z.enum(["approved", "changes_requested", "commented", "pending", "none"]),
  updatedAt: z.string().nullable(),
  url: z.string().nullable(),
});
export type GithubPull = z.infer<typeof GithubPullSchema>;

export const GithubPullFileSchema = z.object({
  filename: z.string().min(1),
  status: z.string().max(32),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type GithubPullFile = z.infer<typeof GithubPullFileSchema>;

export const GithubBranchListSchema = z.object({
  source: GithubSourceSchema,
  items: z.array(GithubBranchSchema),
});
export const GithubCommitListSchema = z.object({
  source: GithubSourceSchema,
  items: z.array(GithubCommitSchema),
});
/** PRs exist only on GitHub: 503-style guidance comes from /github/status, not a local fallback. */
export const GithubPullListSchema = z.object({ items: z.array(GithubPullSchema) });
export const GithubPullFilesSchema = z.object({
  pull: GithubPullSchema,
  files: z.array(GithubPullFileSchema),
});
export type GithubBranchList = z.infer<typeof GithubBranchListSchema>;
export type GithubCommitList = z.infer<typeof GithubCommitListSchema>;
export type GithubPullList = z.infer<typeof GithubPullListSchema>;
export type GithubPullFiles = z.infer<typeof GithubPullFilesSchema>;

/** GET /github/repos/:owner/:repo/{commits,pulls}?branch=&state=&limit= */
export const GithubListQuerySchema = z.object({
  branch: z.string().min(1).max(255).optional(),
  state: z.enum(["open", "closed", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type GithubListQuery = z.infer<typeof GithubListQuerySchema>;
