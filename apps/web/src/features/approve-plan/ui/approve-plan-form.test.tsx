import { BYPASS_CONFIRMATION_PHRASE } from "@nexora/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ApprovePlanForm } from "./approve-plan-form";
import { executionFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const execution = { ...executionFixtures[0]!, status: "plan_ready" as const };

function captureApprove() {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/v1/executions/:id/approve", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ ...execution, status: "running" });
    }),
  );
  return bodies;
}

describe("ApprovePlanForm", () => {
  it("shows every planning column for each task", async () => {
    renderWithProviders(<ApprovePlanForm execution={execution} onApproved={vi.fn()} />);
    const table = await screen.findByRole("table", { name: /execution plan/i });
    for (const h of ["ID", "Task", "Agent", "Mode", "Depends on", "Priority", "Status"]) {
      expect(within(table).getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Drop legacy settings table")).toBeInTheDocument();
  });

  it("highlights file conflicts between tasks", async () => {
    renderWithProviders(<ApprovePlanForm execution={execution} onApproved={vi.fn()} />);
    const conflicts = await screen.findByRole("region", { name: /file conflicts/i });
    expect(conflicts).toHaveTextContent("T-1 ↔ T-3");
    expect(conflicts).toHaveTextContent(/one after the other/);
    expect(screen.getByText("conflicts with T-3")).toBeInTheDocument();
  });

  it("offers one approval checkbox per risky task, all unchecked", async () => {
    renderWithProviders(<ApprovePlanForm execution={execution} onApproved={vi.fn()} />);
    const boxes = await screen.findAllByRole("checkbox", { name: /approve risky task/i });
    expect(boxes).toHaveLength(2);
    for (const b of boxes) expect(b).not.toBeChecked();
  });

  it("approves only the ticked risky tasks; bypass stays off by default", async () => {
    const bodies = captureApprove();
    const onApproved = vi.fn();
    const { user } = renderWithProviders(
      <ApprovePlanForm execution={execution} onApproved={onApproved} />,
    );
    await user.click(await screen.findByRole("checkbox", { name: /approve risky task T-2/i }));
    expect(screen.getByText(/1 risky task will wait/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /approve & start/i }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ approveRiskyTaskIds: ["T-2"], permissionBypass: false }]);
  });

  it("requires the exact phrase before enabling permission bypass", async () => {
    const bodies = captureApprove();
    const onApproved = vi.fn();
    const { user } = renderWithProviders(
      <ApprovePlanForm execution={execution} onApproved={onApproved} />,
    );
    const toggle = await screen.findByRole("switch", { name: /bypass agent permission/i });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    const phrase = screen.getByLabelText(/to confirm/i);
    await user.type(phrase, "bypass");
    await user.click(screen.getByRole("button", { name: /approve & start/i }));
    expect(await screen.findByText(/exactly to enable permission bypass/i)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.clear(phrase);
    await user.type(phrase, BYPASS_CONFIRMATION_PHRASE);
    await user.click(screen.getByRole("button", { name: /approve & start/i }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledOnce());
    expect(bodies).toEqual([
      {
        approveRiskyTaskIds: [],
        permissionBypass: true,
        bypassConfirmation: BYPASS_CONFIRMATION_PHRASE,
      },
    ]);
  });

  it("explains when there is no plan yet", async () => {
    server.use(
      http.get("*/api/v1/executions/:id/tasks", () =>
        HttpResponse.json({ items: [], conflicts: [] }),
      ),
    );
    renderWithProviders(<ApprovePlanForm execution={execution} onApproved={vi.fn()} />);
    expect(await screen.findByText("No plan yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve & start/i })).not.toBeInTheDocument();
  });
});
