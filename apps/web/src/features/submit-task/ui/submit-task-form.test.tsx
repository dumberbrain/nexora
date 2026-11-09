import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { executionKeys } from "@/entities/execution";

import { SubmitTaskForm } from "./submit-task-form";
import { projectFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const NEW_ID = "01JCXK0000000000000000X777";

describe("SubmitTaskForm", () => {
  it("requires a project and a prompt before calling the API", async () => {
    const posted = vi.fn<() => void>();
    server.use(
      http.post("*/api/v1/executions", () => {
        posted();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<SubmitTaskForm onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /analyse task/i }));
    expect(await screen.findByText("Choose a project")).toBeInTheDocument();
    expect(screen.getByText("Describe the task")).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("shows a live character counter out of 20 000", async () => {
    const { user } = renderWithProviders(<SubmitTaskForm onSubmitted={vi.fn()} />);
    await user.type(await screen.findByLabelText(/task description/i), "hello");
    expect(screen.getByText("5 / 20,000 characters")).toBeInTheDocument();
  });

  it("posts the trimmed task, seeds the execution cache and reports it", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/v1/executions", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: NEW_ID, status: "awaiting_mode" }, { status: 201 });
      }),
    );
    const onSubmitted = vi.fn();
    const { user, queryClient } = renderWithProviders(<SubmitTaskForm onSubmitted={onSubmitted} />);
    await user.selectOptions(await screen.findByLabelText(/^project/i), projectFixtures[1]!.id);
    await user.type(screen.getByLabelText(/task description/i), "  Add billing export  ");
    await user.click(screen.getByRole("button", { name: /analyse task/i }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(body).toEqual({ projectId: projectFixtures[1]!.id, prompt: "Add billing export" });
    expect(queryClient.getQueryData(executionKeys.detail(NEW_ID))).toEqual(
      expect.objectContaining({ status: "awaiting_mode" }),
    );
  });

  it("guides the user to register a project when none exists", async () => {
    server.use(http.get("*/api/v1/projects", () => HttpResponse.json({ items: [] })));
    renderWithProviders(<SubmitTaskForm onSubmitted={vi.fn()} />);
    expect(await screen.findByText("No project registered")).toBeInTheDocument();
  });

  it("surfaces a server error", async () => {
    server.use(
      http.post("*/api/v1/executions", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_FAILED", message: "project folder is gone" } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderWithProviders(
      <SubmitTaskForm onSubmitted={vi.fn()} defaultProjectId={projectFixtures[0]!.id} />,
    );
    await user.type(await screen.findByLabelText(/task description/i), "x");
    await user.click(screen.getByRole("button", { name: /analyse task/i }));
    expect(await screen.findByText("project folder is gone")).toBeInTheDocument();
  });
});
