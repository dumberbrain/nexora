import {
  type ApiErrorBody,
  type ApprovalDecisionInput,
  type ApprovalList,
  type ApprovalRequest,
} from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

const base: ApprovalRequest = {
  id: "01JCXK0000000000000000A001",
  executionId: "01JCXK0000000000000000X002",
  taskId: "T-2",
  sessionId: null,
  agentId: null,
  action: "Run task T-2: Drop legacy settings table",
  riskClass: "destructive",
  details: { ownedPaths: ["apps/server/drizzle/**"] },
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  note: null,
  createdAt: NOW - 30_000,
};

export const approvalFixtures: ApprovalRequest[] = [
  base,
  {
    ...base,
    id: "01JCXK0000000000000000A002",
    executionId: "01JCXK0000000000000000X009",
    taskId: "T-5",
    action: "Deploy to production",
    riskClass: "deploy",
  },
];

const notFound: ApiErrorBody = { error: { code: "NOT_FOUND", message: "approval not found" } };

export const approvalHandlers = [
  http.get("*/api/v1/approvals", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    const items = approvalFixtures.filter((a) => !status || a.status === status);
    return HttpResponse.json<ApprovalList>({ items });
  }),
  http.post("*/api/v1/approvals/:id/decision", async ({ params, request }) => {
    const found = approvalFixtures.find((a) => a.id === params.id);
    if (!found) return HttpResponse.json(notFound, { status: 404 });
    const body = (await request.json()) as ApprovalDecisionInput;
    return HttpResponse.json<ApprovalRequest>({
      ...found,
      status: body.decision === "approve" ? "approved" : "rejected",
      decidedBy: "local-user",
      decidedAt: NOW,
      note: body.note ?? null,
    });
  }),
];
