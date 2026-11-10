import { type ModelConsent, ModelConsentInputSchema, UlidSchema } from "@ubuliera/contracts";
import { type Hono } from "hono";

import { type ConsentService } from "../../modules/execution-orchestrator";
import { type ProjectService } from "../../modules/project-registry";
import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { readJson } from "../request";

export interface ConsentRouteDeps {
  consent: ConsentService;
  projects: ProjectService;
}

function projectId(raw: string, projects: ProjectService): string {
  if (!UlidSchema.safeParse(raw).success) throw new AppError("NOT_FOUND", "Project not found");
  return projects.get(raw).id;
}

export function registerConsentRoutes(api: Hono<AppBindings>, deps: ConsentRouteDeps): void {
  api.get("/projects/:id/model-consent", (c) => {
    const id = projectId(c.req.param("id"), deps.projects);
    return c.json<ModelConsent>({ projectId: id, alwaysAllow: deps.consent.isAlwaysAllowed(id) });
  });

  api.put("/projects/:id/model-consent", async (c) => {
    const id = projectId(c.req.param("id"), deps.projects);
    const { alwaysAllow } = ModelConsentInputSchema.parse(await readJson(c));
    deps.consent.setAlwaysAllow(id, alwaysAllow, c.get("actor"));
    return c.json<ModelConsent>({ projectId: id, alwaysAllow });
  });
}
