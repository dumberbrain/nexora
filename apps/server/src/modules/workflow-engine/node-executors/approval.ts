import { ApprovalNodeConfigSchema } from "@nexora/contracts";

import { type ApprovalService } from "../../permission-manager/approval.service";
import { type NodeExecutor } from "../executor";

export type WorkflowApprovals = Pick<ApprovalService, "requestWorkflowApproval" | "expireRequest">;

/**
 * `approval` node → an ApprovalRequest in the inbox; the attempt waits (no timeout) until a human
 * decides. Approve completes the node, reject fails it; cancelling the run expires the request.
 */
export function approvalExecutor(approvals: WorkflowApprovals): NodeExecutor {
  return async (ctx) => {
    const config = ApprovalNodeConfigSchema.parse(ctx.node.config);
    if (ctx.signal.aborted) throw new Error("cancelled");
    const { approval, decision } = approvals.requestWorkflowApproval({
      executionId: ctx.run.executionId,
      nodeId: ctx.node.id,
      label: ctx.node.label,
      message: config.message,
      riskClass: config.riskClass,
    });
    ctx.waiting();
    const onAbort = () => void approvals.expireRequest(approval.id, "workflow run cancelled");
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const verdict = await decision;
      if (verdict !== "allow") throw new Error(`approval ${approval.id} was not granted`);
      return { output: "approved" };
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }
  };
}
