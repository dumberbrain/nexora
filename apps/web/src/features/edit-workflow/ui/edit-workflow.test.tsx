import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeNode, type WorkflowGraph } from "@/entities/workflow";

import { CreateWorkflowForm } from "./create-workflow-form";
import { RunWorkflowDialog } from "./run-workflow-dialog";
import { SaveVersionButton } from "./save-version-button";
import {
  projectFixtures,
  WORKFLOW_EXECUTION_ID,
  workflowFixtures,
  workflowGraphFixture,
} from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const W1 = workflowFixtures[0]!.id;

describe("SaveVersionButton", () => {
  it("saves the graph as the next version and reports its number", async () => {
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <SaveVersionButton workflowId={W1} graph={workflowGraphFixture} onSaved={onSaved} />,
    );
    await user.click(await screen.findByRole("button", { name: "Save as new version" }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 })),
    );
  });

  it("lists the graph issues of a rejected save", async () => {
    const broken: WorkflowGraph = {
      ...workflowGraphFixture,
      nodes: [...workflowGraphFixture.nodes, makeNode("skill", "skill-1", { x: 0, y: 600 })],
    };
    const { user } = renderWithProviders(
      <SaveVersionButton workflowId={W1} graph={broken} onSaved={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: "Save as new version" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not saved: graph is invalid");
    expect(alert).toHaveTextContent("Skill: config is incomplete");
  });
});

describe("RunWorkflowDialog", () => {
  it("requires a project, then starts the run and hands over the execution id", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/v1/workflows/:id/versions/:v/run", async ({ request, params }) => {
        body = { ...((await request.json()) as object), version: params.v };
        return HttpResponse.json(
          { executionId: WORKFLOW_EXECUTION_ID, run: { id: "r" } },
          { status: 201 },
        );
      }),
    );
    const onStarted = vi.fn();
    const { user } = renderWithProviders(
      <RunWorkflowDialog
        workflowId={W1}
        workflowName="Feature pipeline"
        version={1}
        onStarted={onStarted}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Run version 1" }));
    expect(screen.getByRole("dialog", { name: "Run Feature pipeline v1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start run" }));
    expect(await screen.findByText("Choose a project")).toBeInTheDocument();

    await screen.findByRole("option", { name: /ubuliera/ });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Project" }),
      projectFixtures[0]!.id,
    );
    await user.type(screen.getByRole("textbox", { name: /Prompt/ }), "Add dark mode");
    await user.click(screen.getByRole("button", { name: "Start run" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(WORKFLOW_EXECUTION_ID));
    expect(body).toEqual({
      projectId: projectFixtures[0]!.id,
      prompt: "Add dark mode",
      version: "1",
    });
  });
});

describe("CreateWorkflowForm", () => {
  it("creates a definition with a start → end graph", async () => {
    let sent: { name?: string; graph?: WorkflowGraph } = {};
    server.use(
      http.post("*/api/v1/workflows", async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json(
          { ...workflowFixtures[0], id: "NEW", latest: null },
          { status: 201 },
        );
      }),
    );
    const onCreated = vi.fn();
    const { user } = renderWithProviders(<CreateWorkflowForm onCreated={onCreated} />);
    await user.click(await screen.findByRole("button", { name: "Create workflow" }));
    expect(await screen.findByText("Name the workflow")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Release");
    await user.click(screen.getByRole("button", { name: "Create workflow" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(sent.name).toBe("Release");
    expect(sent.graph?.nodes.map((n) => n.kind)).toEqual(["start", "end"]);
  });
});
