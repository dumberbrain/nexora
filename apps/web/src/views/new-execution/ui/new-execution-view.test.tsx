import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { NewExecutionView } from "./new-execution-view";
import { executionFixtures, projectFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";
import { newExecutionSearchSchema } from "../model/new-execution-search";

const X1 = executionFixtures[0]!.id;
const RUNNING = executionFixtures[1]!.id;

describe("newExecutionSearchSchema", () => {
  it("defaults to the task step and drops invalid values", () => {
    expect(newExecutionSearchSchema.parse({})).toEqual({ step: "task" });
    expect(newExecutionSearchSchema.parse({ step: "nope", executionId: "" })).toEqual({
      step: "task",
    });
    expect(newExecutionSearchSchema.parse({ step: "plan", executionId: X1 })).toEqual({
      step: "plan",
      executionId: X1,
    });
  });
});

describe("NewExecutionView", () => {
  it("marks the current wizard step", async () => {
    renderWithProviders(
      <NewExecutionView search={{ step: "task" }} onSearchChange={vi.fn()} onLaunched={vi.fn()} />,
    );
    const steps = await screen.findByRole("list", { name: /wizard steps/i });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent(/describe task/i);
  });

  it("moves to the mode step with the new execution id after submitting", async () => {
    const onSearchChange = vi.fn();
    const { user } = renderWithProviders(
      <NewExecutionView
        search={{ step: "task" }}
        onSearchChange={onSearchChange}
        onLaunched={vi.fn()}
      />,
    );
    await user.selectOptions(await screen.findByLabelText(/^project/i), projectFixtures[0]!.id);
    await user.type(screen.getByLabelText(/task description/i), "Add a dark-mode toggle");
    await user.click(screen.getByRole("button", { name: /analyse task/i }));
    await waitFor(() =>
      expect(onSearchChange).toHaveBeenCalledWith({ step: "mode", executionId: X1 }),
    );
  });

  it("shows the analysis next to the mode choice", async () => {
    renderWithProviders(
      <NewExecutionView
        search={{ step: "mode", executionId: X1 }}
        onSearchChange={vi.fn()}
        onLaunched={vi.fn()}
      />,
    );
    expect(await screen.findByRole("region", { name: /task analysis/i })).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /multi-session/i })).toBeChecked();
  });

  it("falls back to the task step when a later step has no execution", async () => {
    renderWithProviders(
      <NewExecutionView search={{ step: "plan" }} onSearchChange={vi.fn()} onLaunched={vi.fn()} />,
    );
    expect(await screen.findByRole("form", { name: /submit task/i })).toBeInTheDocument();
  });

  it("generates and approves the plan, then hands over to the execution view", async () => {
    server.use(
      http.get("*/api/v1/executions/:id/tasks", () =>
        HttpResponse.json({ items: [], conflicts: [] }),
      ),
    );
    const onLaunched = vi.fn();
    const { user } = renderWithProviders(
      <NewExecutionView
        search={{ step: "plan", executionId: X1 }}
        onSearchChange={vi.fn()}
        onLaunched={onLaunched}
      />,
    );
    expect(await screen.findByText("No plan yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generate plan/i }));
    await user.click(await screen.findByRole("button", { name: /approve & start/i }));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith(X1));
  });

  it("links to the execution view when the execution already runs", async () => {
    renderWithProviders(
      <NewExecutionView
        search={{ step: "mode", executionId: RUNNING }}
        onSearchChange={vi.fn()}
        onLaunched={vi.fn()}
      />,
    );
    const link = await screen.findByRole("link", { name: /open execution/i });
    expect(link).toHaveAttribute("href", `/executions/${RUNNING}`);
  });
});
