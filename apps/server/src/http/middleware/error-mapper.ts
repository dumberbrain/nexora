import { type Context, type ErrorHandler, type NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

import { type Logger } from "../../lib/logger";
import { AppError, errorBody } from "../errors";

/** Map every thrown error to the single API error shape (contracts/rest-api.md). */
export function errorMapper(log: Logger): ErrorHandler {
  return (err: Error, c: Context) => {
    if (err instanceof AppError) {
      return c.json(errorBody(err.code, err.message, err.details), err.status);
    }
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return c.json(errorBody("VALIDATION_FAILED", "Request validation failed", issues), 400);
    }
    if (err instanceof HTTPException) {
      const code =
        err.status === 401
          ? "UNAUTHENTICATED"
          : err.status === 403
            ? "FORBIDDEN"
            : err.status === 404
              ? "NOT_FOUND"
              : err.status < 500
                ? "VALIDATION_FAILED"
                : "INTERNAL";
      return c.json(errorBody(code, err.message || code), code === "INTERNAL" ? 500 : err.status);
    }
    log.error({ err, path: c.req.path, method: c.req.method }, "unhandled error");
    return c.json(errorBody("INTERNAL", "Internal server error"), 500);
  };
}

export const notFound: NotFoundHandler = (c) =>
  c.json(errorBody("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`), 404);
