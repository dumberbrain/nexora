import { type MiddlewareHandler } from "hono";

import { AppError } from "../errors";

const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"];

export interface OriginPolicy {
  remote: boolean;
  ports: number[];
}

/**
 * Pure Host/Origin check shared by HTTP and the WebSocket handshake (WebSockets are not
 * protected by CORS). Loopback mode: Host must be a loopback name on one of our ports and a
 * present Origin must be one of those origins. Remote (token-protected) mode: any Host, but a
 * present Origin must match it. Returns the reason when rejected.
 */
export function checkHostOrigin(
  policy: OriginPolicy,
  host: string | undefined,
  origin: string | undefined,
): string | null {
  const h = host?.toLowerCase();
  if (!h) return "Missing Host header";
  if (!policy.remote) {
    const allowedHosts = new Set(
      policy.ports.flatMap((p) => LOOPBACK_NAMES.map((name) => `${name}:${p}`)),
    );
    if (!allowedHosts.has(h)) return "Host not allowed";
    if (origin !== undefined) {
      const o = origin.toLowerCase();
      if (!allowedHosts.has(o.replace(/^http:\/\//, "")) || !o.startsWith("http://")) {
        return "Cross-origin request rejected";
      }
    }
    return null;
  }
  if (origin !== undefined) {
    try {
      if (new URL(origin).host.toLowerCase() !== h) return "Cross-origin request rejected";
    } catch {
      return "Cross-origin request rejected";
    }
  }
  return null;
}

/** DNS-rebinding and cross-origin protection for HTTP routes. */
export function originGuard(policy: OriginPolicy): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    const reason = checkHostOrigin(policy, host, c.req.header("origin"));
    if (reason) throw new AppError("FORBIDDEN", reason);
    await next();
  };
}
