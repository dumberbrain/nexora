import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";

import { approvalKeys } from "@/entities/approval";

import { DecideApprovalForm } from "./decide-approval-form";
import { approvalFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const approval = approvalFixtures[0]!;

function captureDecisions() {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/v1/approvals/:id/decision", async ({ request }) => {
      bodies.push(await request.clone().json());
      return undefined;
    }),
  );
  return bodies;
}

describe("DecideApprovalForm", () => {
  it("approves with an optional note and refreshes the inbox", async () => {
    const bodies = captureDecisions();
    const onDecided = vi.fn();
    const { user, queryClient } = renderWithProviders(
      <DecideApprovalForm approval={approval} onDecided={onDecided} />,
    );
    queryClient.setQueryData(approvalKeys.list({ status: "pending" }), { items: [approval] });
    await user.type(await screen.findByLabelText(/note/i), "backup taken");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(onDecided).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" })),
    );
    expect(bodies).toEqual([{ decision: "approve", note: "backup taken" }]);
    expect(queryClient.getQueryState(approvalKeys.list({ status: "pending" }))?.isInvalidated).toBe(
      true,
    );
  });

  it("rejects without a note", async () => {
    const bodies = captureDecisions();
    const { user } = renderWithProviders(<DecideApprovalForm approval={approval} />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() => expect(bodies).toEqual([{ decision: "reject" }]));
  });

  it("shows why a decision failed", async () => {
    const { user } = renderWithProviders(
      <DecideApprovalForm approval={{ ...approval, id: "01JCXK0000000000000000A404" }} />,
    );
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/approval not found/i);
  });
});
