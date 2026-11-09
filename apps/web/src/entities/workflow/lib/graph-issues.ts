import { GraphIssueSchema, GraphValidationSchema } from "@nexora/contracts";

import { ApiError } from "@/shared/api";

import { type GraphIssue } from "../model/types";

/**
 * Graph issues carried by a 400 VALIDATION_FAILED on save. rest-api.md names the details a
 * `GraphValidation`, while the error envelope types `details` as an array — accept both a
 * wrapped GraphValidation and bare GraphIssue items.
 */
export function graphIssuesFromError(error: unknown): GraphIssue[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") return [];
  const raw: unknown[] = Array.isArray(error.details) ? error.details : [error.details];
  return raw.flatMap((item) => {
    const validation = GraphValidationSchema.safeParse(item);
    if (validation.success) return validation.data.issues;
    const issue = GraphIssueSchema.safeParse(item);
    return issue.success ? [issue.data] : [];
  });
}
