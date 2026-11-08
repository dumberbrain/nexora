import { HOOK_TOKEN_HEADER } from "@nexora/contracts";
import { type Context, type Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { type HookIngestService } from "../../modules/event-manager/hook-ingest.service";
import { HookPayloadSchema } from "../../modules/event-manager/normalizers/hook-payload";
import { type AppBindings } from "../context";
import { AppError, errorBody } from "../errors";
import { readJson } from "../request";

/** Hook bodies can embed whole tool responses; EventStore caps what is stored at 32 KB. */
const MAX_HOOK_BODY_BYTES = 5 * 1024 * 1024;

/** Peer address from @hono/node-server (`c.env.incoming`); undefined under app.request(). */
function remoteAddress(c: Context): string | undefined {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null || !("incoming" in env)) return undefined;
  const incoming = env.incoming as { socket?: { remoteAddress?: unknown } } | undefined;
  const addr = incoming?.socket?.remoteAddress;
  return typeof addr === "string" ? addr : undefined;
}

export function isLoopbackAddress(addr: string): boolean {
  return addr === "::1" || addr.startsWith("127.") || addr.startsWith("::ffff:127.");
}

/**
 * POST /hooks/ingest (T057) — PUBLIC: Claude Code has no session cookie, so it authenticates with
 * the per-project X-Nexora-Hook-Token instead, and only loopback peers are accepted. Observed
 * sessions are never steered: the answer is always `{}` (no hook decision).
 */
export function registerHookIngestRoute(api: Hono<AppBindings>, ingest: HookIngestService): void {
  api.post(
    "/hooks/ingest",
    bodyLimit({
      maxSize: MAX_HOOK_BODY_BYTES,
      onError: (c) => c.json(errorBody("VALIDATION_FAILED", "Hook payload too large"), 413),
    }),
    async (c) => {
      const addr = remoteAddress(c);
      if (addr !== undefined && !isLoopbackAddress(addr)) {
        throw new AppError("FORBIDDEN", "Hook ingest accepts loopback requests only");
      }
      const project = ingest.authenticate(c.req.header(HOOK_TOKEN_HEADER));
      if (!project) {
        throw new AppError("UNAUTHENTICATED", `Missing or invalid ${HOOK_TOKEN_HEADER}`);
      }
      const parsed = HookPayloadSchema.safeParse(await readJson(c));
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION_FAILED",
          "Hook payload must be an object with session_id and hook_event_name",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      ingest.ingest(project, parsed.data);
      return c.json({});
    },
  );
}
