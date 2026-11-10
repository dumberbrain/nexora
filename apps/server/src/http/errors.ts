import { type ApiErrorBody, ERROR_STATUS, type ErrorCode } from "@ubuliera/contracts";

/** Throw from any handler/middleware; the error mapper turns it into the single error shape. */
export class AppError extends Error {
  override readonly name = "AppError";
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown[],
  ) {
    super(message);
  }

  get status(): (typeof ERROR_STATUS)[ErrorCode] {
    return ERROR_STATUS[this.code];
  }
}

export function errorBody(code: ErrorCode, message: string, details?: unknown[]): ApiErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
