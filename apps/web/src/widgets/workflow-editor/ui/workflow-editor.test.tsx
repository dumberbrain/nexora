import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { applyWorkflowEvents, defaultGraph } from "@/entities/workflow";

import { WorkflowEditor } from "./workflow-editor";
import { WorkflowRunOverlay } from "./workflow-run-overlay";
import {
  makeEvent,
  WORKFLOW_EXECUTION_ID,
  workflowGraphFixture,
  workflowRunFixture,
} from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";
import { useWorkflowDraft } from "../model/use-workflow-draft";

// React Flow measures its viewport — jsdom has no layout engine.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function Harness({ graph = defaultGraph(), readOnly = false }) {
  const draft = useWorkflowDraft(graph);
  return <WorkflowEditor draft={draft} readOnly={readOnly} />;
}

const canvas = () => screen.getByRole("region", { name: "Workflow canvas" });

describe("WorkflowEditor", () => {
  it("starts with start and end and adds palette nodes from the keyboard", async () => {
    const { user } = renderWithProviders(<Harness />);
    await screen.findByRole("region", { name: "Workflow canvas" });
    expect(screen.getByTestId("wf-node-start")).toHaveTextContent("Start");
    expect(screen.getByTestId("wf-node-end")).toHaveTextContent("End");
    for (const kind of ["Agent", "Skill", "MCP tool", "Condition", "Approval"]) {
      expect(screen.getByRole("button", { name: `Add ${kind} node` })).toBeInTheDocument();
    }
    screen.getByRole("button", { name: "Add Parallel fork node" }).focus();
    await user.keyboard("{Enter}");
    expect(within(canvas()).getByText("Parallel fork 1")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Selected node" })).toHaveValue("parallel_fork-1");
    expect(screen.getByRole("form", { name: "Properties of Parallel fork 1" })).toBeInTheDocument();
  });

  it("connects nodes without dragging and labels condition branches", async () => {
    const { user } = renderWithProviders(<Harness />);
    await screen.findByRole("region", { name: "Workflow canvas" });
    await user.click(screen.getByRole("button", { name: "Add Condition node" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Connect to (true branch)" }),
      "End",
    );
    await user.click(screen.getByRole("button", { name: "Add connection" }));
    const list = screen.getByRole("list", { name: "Connections from Condition 1" });
    expect(list).toHaveTextContent("→ End (when true)");
    expect(screen.getByRole("combobox", { name: "Connect to (false branch)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove connection to End" }));
    expect(screen.getByText("No outgoing connections.")).toBeInTheDocument();
  });

  it("validates node properties with the contract schema before applying them", async () => {
    const { user } = renderWithProviders(<Harness />);
    await screen.findByRole("region", { name: "Workflow canvas" });
    await user.click(screen.getByRole("button", { name: "Add Agent node" }));
    const form = screen.getByRole("form", { name: "Properties of Agent 1" });
    const maxAttempts = within(form).getByRole("spinbutton", { name: "Max attempts" });
    await user.clear(maxAttempts);
    await user.type(maxAttempts, "9");
    await user.click(within(form).getByRole("button", { name: "Apply changes" }));
    expect(await within(form).findByText("Prompt is required")).toBeInTheDocument();
    expect(within(form).getByText("At most 5 attempts")).toBeInTheDocument();

    await user.type(within(form).getByRole("textbox", { name: "Prompt" }), "Write the tests");
    await user.clear(maxAttempts);
    await user.type(maxAttempts, "3");
    await user.clear(within(form).getByRole("textbox", { name: "Label" }));
    await user.type(within(form).getByRole("textbox", { name: "Label" }), "Tests");
    await user.click(within(form).getByRole("button", { name: "Apply changes" }));
    expect(await within(canvas()).findByText("Tests")).toBeInTheDocument();
    expect(within(canvas()).getByText("×3")).toBeInTheDocument();
  });

  it("shows server validation issues on the node and in the list", async () => {
    const { user } = renderWithProviders(<Harness />);
    await screen.findByRole("region", { name: "Workflow canvas" });
    expect(await screen.findByText("Graph is valid")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Agent node" }));
    const issues = await screen.findByRole("list", { name: "Validation issues" });
    expect(issues).toHaveTextContent("invalid config");
    expect(issues).toHaveTextContent("Agent 1: config is incomplete");
    expect(within(canvas()).getByText("1 issue")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Selected node" }), "start");
    await user.click(within(issues).getByRole("button", { name: "Agent 1" }));
    expect(screen.getByRole("combobox", { name: "Selected node" })).toHaveValue("agent-1");
  });

  it("deletes a selected node with a button, but never start or end", async () => {
    const { user } = renderWithProviders(<Harness />);
    await screen.findByRole("region", { name: "Workflow canvas" });
    await user.click(screen.getByRole("button", { name: "Add Approval node" }));
    await user.click(screen.getByRole("button", { name: "Delete node" }));
    expect(within(canvas()).queryByText("Approval 1")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Selected node" }), "start");
    expect(screen.queryByRole("button", { name: "Delete node" })).not.toBeInTheDocument();
  });

  it("is read-only for older versions: no palette, disabled properties", async () => {
    const { user } = renderWithProviders(<Harness graph={workflowGraphFixture} readOnly />);
    await screen.findByRole("region", { name: "Workflow canvas" });
    expect(screen.queryByRole("button", { name: /^Add .* node$/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Selected node" }), "agent-1");
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Apply changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add connection" })).not.toBeInTheDocument();
  });
});

describe("WorkflowRunOverlay", () => {
  it("overlays each node's run state and follows live node changes", async () => {
    const { queryClient, user } = renderWithProviders(
      <WorkflowRunOverlay executionId={WORKFLOW_EXECUTION_ID} />,
    );
    const approval = await screen.findByTestId("wf-node-approval-1");
    expect(approval).toHaveAttribute("data-run-status", "waiting_for_approval");
    expect(within(approval).getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByTestId("wf-node-end")).toHaveAttribute("data-run-status", "pending");
    expect(
      within(screen.getByTestId("wf-node-agent-1")).getByText("attempt 2"),
    ).toBeInTheDocument();
    expect(screen.getByText("Run Waiting for approval")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Selected node" }), "agent-1");
    expect(screen.getByText("agent-1 done")).toBeInTheDocument();

    await act(() =>
      applyWorkflowEvents(queryClient, WORKFLOW_EXECUTION_ID, [
        makeEvent({
          id: "01JCXK0000000000000000E0W1",
          type: "workflow.node_changed",
          summary: "approved",
          executionId: WORKFLOW_EXECUTION_ID,
          payload: {
            runId: workflowRunFixture.run.id,
            nodeId: "approval-1",
            attempt: 1,
            status: "completed",
          },
        }),
      ]),
    );
    await waitFor(() =>
      expect(screen.getByTestId("wf-node-approval-1")).toHaveAttribute(
        "data-run-status",
        "completed",
      ),
    );
  });
});
