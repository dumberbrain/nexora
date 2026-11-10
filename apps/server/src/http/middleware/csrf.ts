import { CSRF_HEADER } from "@ubuliera/contracts";
import { type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { CSRF_COOKIE, safeEqual, type SessionKeys } from "./session-cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF check for cookie-authenticated mutating requests: the X-Ubuliera-CSRF header
 * must equal the csrf cookie and the server's key. Bearer requests carry no ambient credentials
 * and are exempt.
 */
export function csrfProtection(keys: SessionKeys): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method) || c.get("authMethod") === "bearer") return next();
    const header = c.req.header(CSRF_HEADER);
    const cookie = getCookie(c, CSRF_COOKIE);
    if (!safeEqual(header, cookie) || !safeEqual(header, keys.csrf)) {
      throw new AppError("FORBIDDEN", "Missing or invalid CSRF token");
    }
    await next();
  };
}
