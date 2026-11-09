import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { WorkflowEditorView } from "./workflow-editor-view";
import { workflowFixtures } from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const W1 = workflowFixtures[0]!.id;

/** Stands in for the route: ?version= lives in state. */
function Page({
  initial,
  onRunStarted = vi.fn(),
}: {
  initial?: number;
  onRunStarted?: () => void;
}) {
  const [version, setVersion] = useState<number | undefined>(initial);
  return (
    <WorkflowEditorView
      workflowId={W1}
      version={version}
      onVersionChange={setVersion}
      onRunStarted={onRunStarted}
    />
  );
}

describe("WorkflowEditorView", () => {
  it("edits the latest version and saves it as version 2", async () => {
    const { user } = renderWithProviders(<Page />);
    expect(await screen.findByRole("heading", { name: "Feature pipeline" })).toBeInTheDocument();
    const save = await screen.findByRole("button", { name: "Save as new version" });
    expect(save).toBeDisabled(); // nothing changed yet

    await user.click(screen.getByRole("button", { name: "Add Parallel fork node" }));
    await user.click(save);
    expect(await screen.findByText("Saved as version 2")).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Version" });
    await waitFor(() => expect(picker).toHaveValue("2"));
    expect(within(picker).getByRole("option", { name: "v2 (latest)" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "v1 (read-only)" })).toBeInTheDocument();
    expect(await screen.findByTestId("wf-node-parallel_fork-1")).toBeInTheDocument();
  });

  it("opens an older version read-only but keeps it runnable", async () => {
    const { user } = renderWithProviders(<Page />);
    await user.click(await screen.findByRole("button", { name: "Add Agent node" }));
    const agent = screen.getByRole("form", { name: "Properties of Agent 2" });
    await user.type(within(agent).getByRole("textbox", { name: "Prompt" }), "Review");
    await user.click(within(agent).getByRole("button", { name: "Apply changes" }));
    await user.click(screen.getByRole("button", { name: "Save as new version" }));
    await screen.findByText("Saved as version 2");

    await user.selectOptions(await screen.findByRole("combobox", { name: "Version" }), "1");
    expect(await screen.findByText(/v1 is read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as new version" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add .* node$/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("wf-node-agent-2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run version 1" })).toBeEnabled();
  });

  it("runs the version and hands over the new execution", async () => {
    const onRunStarted = vi.fn();
    const { user } = renderWithProviders(<Page onRunStarted={onRunStarted} />);
    await user.click(await screen.findByRole("button", { name: "Run version 1" }));
    const dialog = screen.getByRole("dialog", { name: "Run Feature pipeline v1" });
    await within(dialog).findByRole("option", { name: /nexora/ });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Project" }),
      "01JCXK0000000000000000P001",
    );
    await user.click(within(dialog).getByRole("button", { name: "Start run" }));
    await waitFor(() => expect(onRunStarted).toHaveBeenCalledWith("01JCXK0000000000000000X004"));
  });
});
