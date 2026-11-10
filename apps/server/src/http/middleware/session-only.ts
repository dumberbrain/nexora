import { type Context } from "hono";

import { type AuditService } from "../../modules/permission-manager/audit.service";
import { type AppBindings } from "../context";
import { AppError } from "../errors";

/**
 * Token and settings management is session-cookie only (US8): a bearer token — the remote env
 * token or an MCP API token — can never mint, revoke or re-enable credentials. Denials are
 * audited with the caller's actor.
 */
export function requireSession(
  c: Context<AppBindings>,
  audit: Pick<AuditService, "record">,
  action: string,
  targetType: string,
): void {
  if (c.get("authMethod") === "session") return;
  audit.record({
    actor: c.get("actor"),
    action,
    targetType,
    outcome: "denied",
    details: { reason: "session cookie required", method: c.req.method, path: c.req.path },
  });
  throw new AppError("FORBIDDEN", "This action requires the dashboard session");
}
