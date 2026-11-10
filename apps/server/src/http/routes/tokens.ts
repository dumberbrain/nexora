import {
  type ApiToken,
  type ApiTokenList,
  type CreateApiTokenResult,
  CreateApiTokenInputSchema,
} from "@ubuliera/contracts";
import { type Hono } from "hono";

import { type AuditService } from "../../modules/permission-manager/audit.service";
import { type TokenService } from "../../modules/permission-manager/token.service";
import { type AppBindings } from "../context";
import { requireSession } from "../middleware/session-only";
import { readJson } from "../request";

export interface TokenRouteDeps {
  tokens: Pick<TokenService, "list" | "create" | "revoke">;
  audit: Pick<AuditService, "record">;
}

/**
 * API tokens for MCP clients (T152, contracts/rest-api.md → Settings & API tokens). Session
 * cookie only; the secret appears once, in the 201 of POST /tokens.
 */
export function registerTokenRoutes(api: Hono<AppBindings>, deps: TokenRouteDeps): void {
  const guard = (c: Parameters<typeof requireSession>[0], action: string) =>
    requireSession(c, deps.audit, action, "api_token");

  api.get("/tokens", (c) => {
    guard(c, "token.list");
    return c.json<ApiTokenList>({ items: deps.tokens.list() });
  });

  api.post("/tokens", async (c) => {
    guard(c, "token.create");
    const input = CreateApiTokenInputSchema.parse(await readJson(c));
    const created = deps.tokens.create(input, c.get("actor"));
    c.header("cache-control", "no-store");
    return c.json<CreateApiTokenResult>(created, 201);
  });

  api.delete("/tokens/:id", (c) => {
    guard(c, "token.revoke");
    return c.json<ApiToken>(deps.tokens.revoke(c.req.param("id"), c.get("actor")));
  });
}
