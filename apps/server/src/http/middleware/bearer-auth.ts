import { type MiddlewareHandler } from "hono";

import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { hasValidSession, safeEqual, type SessionKeys } from "./session-cookie";

/** Resolves a bearer token issued for MCP clients (T144). Returns null when unknown/revoked. */
export type ApiTokenVerifier = (
  token: string,
) => { name: string; scope: "read" | "control" } | null;

export interface AuthOptions {
  keys: SessionKeys;
  /** UBULIERA_TOKEN for remote mode */
  envToken: string | undefined;
  verifyApiToken?: ApiTokenVerifier;
}

/** Extract the token from `Authorization: Bearer <token>`. */
export function bearerToken(header: string | undefined): string | undefined {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return m?.[1]?.trim() || undefined;
}

/**
 * Every protected route needs either a valid bearer token (remote/MCP) or the loopback session
 * cookie. Sets `actor` + `authMethod` for audit and CSRF.
 */
export function authenticate(opts: AuthOptions): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const header = c.req.header("authorization");
    if (header !== undefined) {
      const token = bearerToken(header);
      if (token && opts.envToken && safeEqual(token, opts.envToken)) {
        c.set("actor", "user");
        c.set("authMethod", "bearer");
        return next();
      }
      const api = token ? opts.verifyApiToken?.(token) : null;
      if (api) {
        c.set("actor", `mcp_client:${api.name}`);
        c.set("authMethod", "bearer");
        return next();
      }
      throw new AppError("UNAUTHENTICATED", "Invalid bearer token");
    }
    if (hasValidSession(c, opts.keys)) {
      c.set("actor", "user");
      c.set("authMethod", "session");
      return next();
    }
    throw new AppError("UNAUTHENTICATED", "Authentication required");
  };
}
