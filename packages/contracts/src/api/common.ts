import { z } from "zod";

import { UlidSchema } from "../primitives";

/** Error codes and their HTTP status (contracts/rest-api.md). */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CAPABILITY_UNSUPPORTED: 422,
  APPROVAL_REQUIRED: 428,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** The single error shape every endpoint returns. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Cursor pagination query: `?cursor=<ULID>&limit=1..200`. */
export const PaginationQuerySchema = z.object({
  cursor: UlidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** `{ items, nextCursor }` page of any item schema. */
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: UlidSchema.nullable() });
export type Page<T> = { items: T[]; nextCursor: string | null };

export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  db: z.enum(["ok", "down"]),
  uptimeMs: z.number().int().nonnegative(),
});
export type Health = z.infer<typeof HealthSchema>;

/** Header carrying the CSRF token on mutating requests from the web app. */
export const CSRF_HEADER = "X-Ubuliera-CSRF";
