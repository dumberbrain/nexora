import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE = "ubuliera_session";
export const CSRF_COOKIE = "ubuliera_csrf";

/**
 * Per-process secrets. A server restart invalidates sessions; the web app simply calls
 * GET /auth/session again on 401.
 */
export class SessionKeys {
  readonly session = randomBytes(32).toString("base64url");
  readonly csrf = randomBytes(32).toString("base64url");
}

/** Constant-time string comparison (hash first so lengths never leak). */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function issueSession(c: Context, keys: SessionKeys, secure: boolean): void {
  const base = { path: "/", sameSite: "Strict" as const, secure };
  setCookie(c, SESSION_COOKIE, keys.session, { ...base, httpOnly: true });
  // readable by the SPA so it can echo it in X-Ubuliera-CSRF (double-submit)
  setCookie(c, CSRF_COOKIE, keys.csrf, { ...base, httpOnly: false });
}

export function hasValidSession(c: Context, keys: SessionKeys): boolean {
  return safeEqual(getCookie(c, SESSION_COOKIE), keys.session);
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  deleteCookie(c, CSRF_COOKIE, { path: "/" });
}
