import {
  type HookPreview,
  InstallHooksInputSchema,
  type Project,
  type ProjectList,
  RegisterProjectInputSchema,
  UlidSchema,
} from "@nexora/contracts";
import { type Hono } from "hono";

import { type HookInstaller, type ProjectService } from "../../modules/project-registry";
import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { readJson } from "../request";

export interface ProjectRouteDeps {
  projects: ProjectService;
  hookInstaller: HookInstaller;
}

/** Project ids are ULIDs; anything else cannot exist. */
function projectId(raw: string): string {
  if (!UlidSchema.safeParse(raw).success) throw new AppError("NOT_FOUND", "Project not found");
  return raw;
}

/** GET/POST /projects and the hook installer routes (T055, T056). */
export function registerProjectRoutes(api: Hono<AppBindings>, deps: ProjectRouteDeps): void {
  api.get("/projects", (c) => c.json<ProjectList>({ items: deps.projects.list() }));

  api.post("/projects", async (c) => {
    const input = RegisterProjectInputSchema.parse(await readJson(c));
    const project = await deps.projects.register(input, c.get("actor"));
    return c.json<Project>(project, 201);
  });

  api.get("/projects/:id", (c) => c.json<Project>(deps.projects.get(projectId(c.req.param("id")))));

  api.get("/projects/:id/hooks/preview", async (c) =>
    c.json<HookPreview>(await deps.hookInstaller.preview(projectId(c.req.param("id")))),
  );

  api.post("/projects/:id/hooks/install", async (c) => {
    const id = projectId(c.req.param("id"));
    const parsed = InstallHooksInputSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", "Installing hooks requires { confirm: true }", [
        { path: "confirm", message: "must be true — review GET …/hooks/preview first" },
      ]);
    }
    return c.json<Project>(await deps.hookInstaller.install(id, c.get("actor")));
  });

  api.delete("/projects/:id/hooks", async (c) =>
    c.json<Project>(
      await deps.hookInstaller.uninstall(projectId(c.req.param("id")), c.get("actor")),
    ),
  );
}
