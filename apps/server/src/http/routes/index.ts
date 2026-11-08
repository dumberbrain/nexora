import { type Hono } from "hono";

import { type Services } from "../../services";
import { type AppBindings } from "../context";
import { registerEventRoutes } from "./events";
import { registerHookIngestRoute } from "./hooks";
import { registerProjectRoutes } from "./projects";
import { registerSessionRoutes } from "./sessions";

/** Routes mounted before authentication (they carry their own credential check). */
export function registerPublicApiRoutes(api: Hono<AppBindings>, s: Services): void {
  registerHookIngestRoute(api, s.ingest);
}

/** Session/bearer-authenticated, CSRF-protected routes. */
export function registerApiRoutes(api: Hono<AppBindings>, s: Services): void {
  registerProjectRoutes(api, s);
  registerSessionRoutes(api, s);
  registerEventRoutes(api, s);
}
