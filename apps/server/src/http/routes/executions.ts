import {
  ApproveExecutionInputSchema,
  CreateExecutionInputSchema,
  type Execution,
  type ExecutionConfig,
  type ExecutionList,
  type ExecutionTasks,
  GeneratePlanInputSchema,
  RefineAnalysisInputSchema,
  SetModeInputSchema,
  UlidSchema,
  UpdateConfigInputSchema,
  type Verification,
} from "@ubuliera/contracts";
import { type Hono } from "hono";
import { z } from "zod";

import { type Orchestration } from "../../modules/execution-orchestrator";
import { type AppBindings } from "../context";
import { readJson } from "../request";

const ListQuerySchema = z.object({ projectId: UlidSchema.optional() });

/** Empty body ⇒ {} (POST …/plan and …/approve are valid without a body). */
async function bodyOrEmpty(c: Parameters<typeof readJson>[0]): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim() === "") return {};
  return readJson(c);
}

/**
 * Only the config keys the client actually sent — the schema fills defaults, which must not
 * overwrite earlier answers.
 */
function sentConfig(raw: unknown, parsed: ExecutionConfig): Partial<ExecutionConfig> {
  const sent =
    raw !== null &&
    typeof raw === "object" &&
    "config" in raw &&
    raw.config &&
    typeof raw.config === "object"
      ? Object.keys(raw.config)
      : [];
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.includes(k)));
}

/**
 * Executions wizard (T102, contracts/rest-api.md → Executions). Run controls — stop, pause,
 * resume — live in ./controls (registerControlRoutes, T113).
 */
export function registerExecutionRoutes(
  api: Hono<AppBindings>,
  o: Pick<Orchestration, "orchestrator">,
): void {
  const x = o.orchestrator;

  api.post("/executions", async (c) => {
    const input = CreateExecutionInputSchema.parse(await readJson(c));
    return c.json<Execution>(await x.create(input, c.get("actor")), 201);
  });

  api.get("/executions", (c) => {
    const q = ListQuerySchema.parse(c.req.query());
    return c.json<ExecutionList>({ items: x.list(q.projectId ? { projectId: q.projectId } : {}) });
  });

  api.get("/executions/:id", (c) => c.json<Execution>(x.get(c.req.param("id"))));

  api.post("/executions/:id/analysis", async (c) => {
    const input = RefineAnalysisInputSchema.parse(await bodyOrEmpty(c));
    return c.json<Execution>(await x.refineAnalysis(c.req.param("id"), input, c.get("actor")));
  });

  api.get("/executions/:id/modes", async (c) =>
    c.json({ items: await x.modes(c.req.param("id")) }),
  );

  api.put("/executions/:id/mode", async (c) => {
    const input = SetModeInputSchema.parse(await readJson(c));
    return c.json<Execution>(await x.setMode(c.req.param("id"), input, c.get("actor")));
  });

  api.get("/executions/:id/questions", (c) => c.json({ items: x.questions(c.req.param("id")) }));

  api.put("/executions/:id/config", async (c) => {
    const raw = await readJson(c);
    const input = UpdateConfigInputSchema.parse(raw);
    return c.json<Execution>(
      await x.updateConfig(c.req.param("id"), sentConfig(raw, input.config), c.get("actor")),
    );
  });

  api.post("/executions/:id/plan", async (c) => {
    const input = GeneratePlanInputSchema.parse(await bodyOrEmpty(c));
    return c.json<ExecutionTasks>(await x.generatePlan(c.req.param("id"), input, c.get("actor")));
  });

  api.get("/executions/:id/tasks", (c) => c.json<ExecutionTasks>(x.tasks(c.req.param("id"))));

  api.post("/executions/:id/approve", async (c) => {
    const input = ApproveExecutionInputSchema.parse(await bodyOrEmpty(c));
    return c.json<Execution>(await x.approve(c.req.param("id"), input, c.get("actor")));
  });

  api.get("/executions/:id/verification", async (c) =>
    c.json<Verification>(await x.verification(c.req.param("id"))),
  );
}
