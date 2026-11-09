import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApprovalCard } from "./approval-card";
import { approvalFixtures } from "../../../../tests/msw/handlers";
import { approvalApi } from "../api/approval.api";

const first = approvalFixtures[0]!;

describe("ApprovalCard", () => {
  it("shows the action, task, redacted details and caller-composed slots", () => {
    render(
      <ApprovalCard
        approval={first}
        tag={<span>risk-tag</span>}
        actions={<button type="button">ok</button>}
      />,
    );
    expect(screen.getByRole("article", { name: first.action })).toBeInTheDocument();
    expect(screen.getByText("T-2")).toBeInTheDocument();
    expect(screen.getByText(/apps\/server\/drizzle/)).toBeInTheDocument();
    expect(screen.getByText("risk-tag")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok" })).toBeInTheDocument();
  });
});

describe("approvalApi", () => {
  it("lists approvals filtered by status", async () => {
    expect((await approvalApi.list({ status: "pending" })).items).toHaveLength(2);
    expect((await approvalApi.list({ status: "approved" })).items).toHaveLength(0);
  });

  it("posts an explicit decision", async () => {
    const res = await approvalApi.decide(first.id, { decision: "reject", note: "too risky" });
    expect(res).toMatchObject({ status: "rejected", note: "too risky" });
  });
});
