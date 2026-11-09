import {
  ApprovalDecisionInputSchema,
  type ApprovalList,
  type ApprovalRequest,
  ApprovalStatusSchema,
  UlidSchema,
} from "@nexora/contracts";
import { type Hono } from "hono";
import { z } from "zod";

import { type Orchestration } from "../../modules/execution-orchestrator";
import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { readJson } from "../request";

const ListQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  executionId: UlidSchema.optional(),
});

/** Approvals inbox (T093): `GET /approvals?status=pending`, `POST /approvals/:id/decision`. */
export function registerApprovalRoutes(
  api: Hono<AppBindings>,
  o: Pick<Orchestration, "approvals">,
): void {
  api.get("/approvals", (c) => {
    const q = ListQuerySchema.parse(c.req.query());
    return c.json<ApprovalList>({ items: o.approvals.list(q.status, q.executionId) });
  });

  api.post("/approvals/:id/decision", async (c) => {
    const id = c.req.param("id");
    if (!UlidSchema.safeParse(id).success)
      throw new AppError("NOT_FOUND", "Approval request not found");
    const input = ApprovalDecisionInputSchema.parse(await readJson(c));
    return c.json<ApprovalRequest>(o.approvals.decide(id, input, c.get("actor")));
  });
}
