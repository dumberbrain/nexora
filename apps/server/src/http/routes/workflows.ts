import {
  CreateWorkflowInputSchema,
  type GraphValidation,
  type RunWorkflowResult,
  RunWorkflowInputSchema,
  UlidSchema,
  type WorkflowDetail,
  type WorkflowList,
  type WorkflowRunDetail,
  type WorkflowVersion,
  type WorkflowVersionList,
} from "@nexora/contracts";
import { type Hono } from "hono";
import { z } from "zod";

import { type WorkflowService } from "../../modules/workflow-engine/workflow.service";
import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { readJson } from "../request";

export interface WorkflowRouteDeps {
  workflows: Pick<
    WorkflowService,
    "list" | "get" | "create" | "versions" | "saveVersion" | "validate" | "run" | "runDetail"
  >;
}

/** `{ graph }` — the graph itself is checked by the validator (issues, not a zod 400). */
const GraphBodySchema = z.object({ graph: z.unknown() });
const VersionParamSchema = z.coerce.number().int().min(1);

function idParam(raw: string): string {
  const r = UlidSchema.safeParse(raw);
  if (!r.success) throw new AppError("NOT_FOUND", "Workflow not found");
  return r.data;
}

/**
 * US5 workflows (T129, contracts/rest-api.md → Workflows). Saving a graph always creates a new
 * immutable version; invalid graphs are 400 VALIDATION_FAILED with the GraphIssues as `details`.
 */
export function registerWorkflowRoutes(api: Hono<AppBindings>, deps: WorkflowRouteDeps): void {
  const { workflows } = deps;

  api.get("/workflows", (c) => c.json<WorkflowList>(workflows.list()));

  api.post("/workflows", async (c) => {
    const input = CreateWorkflowInputSchema.parse(await readJson(c));
    return c.json<WorkflowDetail>(await workflows.create(input, c.get("actor")), 201);
  });

  // before /workflows/:id so "validate" is never read as an id
  api.post("/workflows/validate", async (c) => {
    const { graph } = GraphBodySchema.parse(await readJson(c));
    return c.json<GraphValidation>(await workflows.validate(graph));
  });

  api.get("/workflows/:id", (c) =>
    c.json<WorkflowDetail>(workflows.get(idParam(c.req.param("id")))),
  );

  api.get("/workflows/:id/versions", (c) =>
    c.json<WorkflowVersionList>(workflows.versions(idParam(c.req.param("id")))),
  );

  api.post("/workflows/:id/versions", async (c) => {
    const id = idParam(c.req.param("id"));
    const { graph } = GraphBodySchema.parse(await readJson(c));
    return c.json<WorkflowVersion>(await workflows.saveVersion(id, graph, c.get("actor")), 201);
  });

  api.post("/workflows/:id/versions/:v/run", async (c) => {
    const id = idParam(c.req.param("id"));
    const v = VersionParamSchema.safeParse(c.req.param("v"));
    if (!v.success) throw new AppError("NOT_FOUND", "Workflow version not found");
    const input = RunWorkflowInputSchema.parse(await readJson(c));
    return c.json<RunWorkflowResult>(await workflows.run(id, v.data, input, c.get("actor")), 201);
  });

  api.get("/executions/:id/workflow-run", (c) => {
    const id = UlidSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new AppError("NOT_FOUND", "Execution not found");
    return c.json<WorkflowRunDetail>(workflows.runDetail(id.data));
  });
}
