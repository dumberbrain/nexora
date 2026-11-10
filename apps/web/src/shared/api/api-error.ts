import { ApiErrorBodySchema, type ErrorCode } from "@ubuliera/contracts";
import { isAxiosError } from "axios";

/** Typed error for every failed API call. `status` is null for network/timeout failures. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly status: number | null,
    readonly details?: unknown[],
  ) {
    super(message);
  }
}

/** Map anything axios throws to ApiError using the server's single error shape. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const parsed = ApiErrorBodySchema.safeParse(error.response?.data);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      return new ApiError(code, message, status, details);
    }
    if (status === null) return new ApiError("NETWORK", "Server unreachable", null);
    return new ApiError(status >= 500 ? "INTERNAL" : "VALIDATION_FAILED", error.message, status);
  }
  return new ApiError("INTERNAL", error instanceof Error ? error.message : "Unknown error", null);
}
