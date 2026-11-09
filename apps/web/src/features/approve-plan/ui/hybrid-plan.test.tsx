import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ApprovePlanForm } from "./approve-plan-form";
import { executionFixtures, hybridPlanFixture } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const hybrid = { ...executionFixtures[0]!, status: "plan_ready" as const, mode: "hybrid" as const };

function rowOf(table: HTMLElement, taskId: string) {
  // the first cell of a row is its id ("T-1" also appears in T-2's depends-on cell)
  const row = within(table).getAllByRole("cell", { name: taskId })[0]?.closest("tr");
  if (!row) throw new Error(`no row for ${taskId}`);
  return row;
}

describe("ApprovePlanForm — hybrid plans (US6)", () => {
  it("shows the mechanism and the planner's reason for every task", async () => {
    server.use(
      http.get("*/api/v1/executions/:id/tasks", () => HttpResponse.json(hybridPlanFixture)),
    );
    renderWithProviders(<ApprovePlanForm execution={hybrid} onApproved={vi.fn()} />);
    const table = await screen.findByRole("table", { name: /execution plan/i });
    expect(within(table).getByRole("columnheader", { name: "Mechanism" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Reason" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Mode" })).not.toBeInTheDocument();

    const t1 = rowOf(table, "T-1");
    expect(t1).toHaveTextContent("Agent Teams");
    expect(t1).toHaveTextContent("teammates negotiate it");
    const t2 = rowOf(table, "T-2");
    expect(t2).toHaveTextContent("Subagents");
    expect(t2).toHaveTextContent("database-engineer specialist");
    expect(rowOf(table, "T-3")).toHaveTextContent("no reason given");
  });

  it("keeps the plain Mode column for a single-mechanism plan", async () => {
    const plain = { ...hybrid, mode: "multi_session" as const };
    renderWithProviders(<ApprovePlanForm execution={plain} onApproved={vi.fn()} />);
    const table = await screen.findByRole("table", { name: /execution plan/i });
    expect(within(table).getByRole("columnheader", { name: "Mode" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Reason" })).not.toBeInTheDocument();
  });
});
