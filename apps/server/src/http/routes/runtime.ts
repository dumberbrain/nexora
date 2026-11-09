import { type RuntimeEnvironment } from "@nexora/contracts";
import { type Hono } from "hono";

import { type ManagedRuntime } from "../../modules/runtime-manager/runtime-adapter";
import { type AppBindings } from "../context";

export interface RuntimeRouteDeps {
  runtime: Pick<ManagedRuntime, "environment">;
}

/** GET /runtime/environment (T087) — Claude Code version, login state, Agent Teams, runtimes. */
export function registerRuntimeRoutes(api: Hono<AppBindings>, deps: RuntimeRouteDeps): void {
  api.get("/runtime/environment", async (c) =>
    c.json<RuntimeEnvironment>(await deps.runtime.environment()),
  );
}
