import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { getLiveSocket } from "@/shared/socket/client";
import { Toaster } from "@/shared/ui/sonner";

import { ApprovalAlerts } from "./approval-alerts";
import { ApprovalsInbox } from "./approvals-inbox";
import { type FakeSocket } from "../../../../tests/fake-socket";
import { approvalFixtures, makeEvent } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

vi.mock("@/shared/socket/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { FakeSocket } = await import("../../../../tests/fake-socket");
  const socket = new FakeSocket();
  return { ...actual, getLiveSocket: () => socket };
});

const fake = () => getLiveSocket() as unknown as FakeSocket;

describe("ApprovalsInbox", () => {
  it("lists pending approvals with risk, task and decision controls", async () => {
    renderWithProviders(<ApprovalsInbox />);
    const inbox = await screen.findByRole("region", { name: /approvals inbox/i });
    const cards = await within(inbox).findAllByRole("article");
    expect(cards).toHaveLength(2);
    const first = cards[0]!;
    expect(first).toHaveTextContent("Run task T-2: Drop legacy settings table");
    expect(first).toHaveTextContent(/destructive risk/i);
    expect(within(first).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("can be narrowed to one execution", async () => {
    renderWithProviders(<ApprovalsInbox executionId={approvalFixtures[1]!.executionId!} />);
    const inbox = await screen.findByRole("region", { name: /approvals inbox/i });
    await waitFor(() => expect(within(inbox).getAllByRole("article")).toHaveLength(1));
    expect(inbox).toHaveTextContent("Deploy to production");
  });

  it("says when nothing is waiting", async () => {
    server.use(http.get("*/api/v1/approvals", () => HttpResponse.json({ items: [] })));
    renderWithProviders(<ApprovalsInbox />);
    expect(await screen.findByText(/nothing waits for your approval/i)).toBeInTheDocument();
  });
});

describe("ApprovalAlerts", () => {
  it("toasts when a new approval request arrives over the socket", async () => {
    renderWithProviders(
      <>
        <ApprovalAlerts />
        <Toaster />
      </>,
    );
    await waitFor(() =>
      expect(fake().sent).toContainEqual({ event: "subscribe", payload: { scope: "global" } }),
    );
    act(() =>
      fake().pushEvents([
        makeEvent({
          id: "01JCXK0000000000000000E900",
          type: "permission.requested",
          summary: "Approval needed: Deploy to production (deploy)",
          payload: { approvalId: "01JCXK0000000000000000A003" },
        }),
        makeEvent({ id: "01JCXK0000000000000000E901", type: "tool.invoked", summary: "Bash" }),
      ]),
    );
    expect(await screen.findByText("Approval needed")).toBeInTheDocument();
    expect(screen.getByText("Approval needed: Deploy to production (deploy)")).toBeInTheDocument();
  });
});
