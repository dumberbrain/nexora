import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExecutionView } from "./execution-view";
import { executionFixtures } from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";

const [setup, running, completed] = executionFixtures as [
  (typeof executionFixtures)[0],
  (typeof executionFixtures)[0],
  (typeof executionFixtures)[0],
];

describe("ExecutionView", () => {
  it("shows the execution status, mode and the prompt", async () => {
    renderWithProviders(<ExecutionView executionId={running.id} />);
    expect(await screen.findByText(running.prompt)).toBeInTheDocument();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Running")).toBeInTheDocument();
    expect(within(header).getByText("Multi-session")).toBeInTheDocument();
  });

  it("lists every task with its exact status name", async () => {
    renderWithProviders(<ExecutionView executionId={running.id} />);
    const table = await screen.findByRole("table", { name: /task statuses/i });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Drop legacy settings table")).toBeInTheDocument();
    expect(within(table).getAllByText("Pending")).toHaveLength(3);
  });

  it("summarises verification once the execution finished", async () => {
    renderWithProviders(<ExecutionView executionId={completed.id} />);
    const summary = await screen.findByRole("region", { name: /verification/i });
    expect(summary).toHaveTextContent("41 passed");
    expect(summary).toHaveTextContent("1 failed");
    expect(summary).toHaveTextContent("2 skipped");
    expect(summary).toHaveTextContent("T-3");
    expect(summary).toHaveTextContent("theme-toggle.tsx");
  });

  it("links an execution still being set up back to its wizard step", async () => {
    renderWithProviders(<ExecutionView executionId={setup.id} />);
    const link = await screen.findByRole("link", { name: /continue setup/i });
    expect(link).toHaveAttribute("href", `/executions/new?step=mode&executionId=${setup.id}`);
  });

  it("puts stop / interrupt & hold / resume in the header of a launched execution", async () => {
    renderWithProviders(<ExecutionView executionId={running.id} />);
    const bar = await screen.findByRole("toolbar", { name: /execution controls/i });
    expect(within(screen.getByRole("banner")).getByRole("toolbar")).toBe(bar);
    for (const name of ["Stop", "Interrupt & hold", "Resume"]) {
      expect(within(bar).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("gives every task row cancel / retry / review controls", async () => {
    renderWithProviders(<ExecutionView executionId={running.id} />);
    const table = await screen.findByRole("table", { name: /task statuses/i });
    const row = within(table).getByRole("row", { name: /T-1/ });
    expect(within(row).getByRole("button", { name: "Cancel T-1" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(within(row).getByRole("button", { name: "Retry T-1" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(row).getByRole("button", { name: "Request review of T-1" })).toBeInTheDocument();
  });

  it("lets the user assign a task, see its approvals and open its messages", async () => {
    renderWithProviders(<ExecutionView executionId={running.id} />);
    expect(await screen.findByRole("form", { name: "Assign task" })).toBeInTheDocument();
    const inbox = await screen.findByRole("region", { name: /approvals inbox/i });
    expect(await within(inbox).findByText(/Drop legacy settings table/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /messages/i })).toHaveAttribute(
      "href",
      `/communication?executionId=${running.id}`,
    );
  });

  it("keeps finished executions read-only (controls disabled, no assign form)", async () => {
    renderWithProviders(<ExecutionView executionId={completed.id} />);
    await screen.findByRole("region", { name: /verification/i });
    expect(screen.queryByRole("form", { name: "Assign task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: /execution controls/i })).toBeInTheDocument();
  });

  it("shows an error for an unknown execution", async () => {
    renderWithProviders(<ExecutionView executionId="01JCXK0000000000000000X404" />);
    expect(await screen.findByText(/execution not found/i)).toBeInTheDocument();
  });
});
