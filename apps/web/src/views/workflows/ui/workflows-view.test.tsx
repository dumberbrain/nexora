import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowsView } from "./workflows-view";
import { workflowFixtures } from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";

describe("WorkflowsView", () => {
  it("lists workflows, marks built-in templates and links each to its editor", async () => {
    renderWithProviders(<WorkflowsView onCreated={vi.fn()} />);
    const list = await screen.findByRole("list", { name: "Workflows" });
    const builtIn = within(list).getByRole("link", { name: "spec-driven" });
    expect(builtIn).toHaveAttribute("href", `/workflows/${workflowFixtures[1]!.id}`);
    expect(within(list).getByText("built-in template")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Feature pipeline" })).toBeInTheDocument();
  });

  it("creates a workflow and opens it", async () => {
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<WorkflowsView onCreated={onCreated} />);
    const form = await screen.findByRole("form", { name: "Create workflow" });
    await user.type(within(form).getByRole("textbox", { name: "Name" }), "Release train");
    await user.click(within(form).getByRole("button", { name: "Create workflow" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("01JCXK0000000000000000W009"));
  });
});
