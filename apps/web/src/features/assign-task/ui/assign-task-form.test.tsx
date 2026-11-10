import { screen, waitFor } from "@testing-library/react";
import { type ExecutionTasks } from "@ubuliera/contracts";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";

import { taskKeys } from "@/entities/task";

import { AssignTaskForm } from "./assign-task-form";
import { executionFixtures, planFixture } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const running = executionFixtures[1]!;

function captureBodies() {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/v1/executions/:id/tasks", async ({ request }) => {
      bodies.push(await request.clone().json());
      return undefined;
    }),
  );
  return bodies;
}

describe("AssignTaskForm", () => {
  it("assigns an additional task as AssignTaskInput and adds it to the board cache", async () => {
    const bodies = captureBodies();
    const onAssigned = vi.fn();
    const { user, queryClient } = renderWithProviders(
      <AssignTaskForm executionId={running.id} onAssigned={onAssigned} />,
    );
    queryClient.setQueryData(taskKeys.byExecution(running.id), planFixture);
    await user.type(await screen.findByLabelText(/^title/i), "Add e2e test for the toggle");
    await user.type(screen.getByLabelText(/agent role/i), "QA Engineer");
    await user.selectOptions(screen.getByLabelText(/priority/i), "p1");
    await user.type(screen.getByLabelText(/depends on/i), "T-1, T-3");
    await user.type(screen.getByLabelText(/owned paths/i), "e2e/**{enter}apps/web/e2e/**");
    await user.click(screen.getByRole("button", { name: "Assign task" }));
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    expect(bodies).toEqual([
      {
        title: "Add e2e test for the toggle",
        description: "",
        assignedAgentRole: "QA Engineer",
        dependsOn: ["T-1", "T-3"],
        priority: "p1",
        ownedPaths: ["e2e/**", "apps/web/e2e/**"],
        riskClass: "normal",
      },
    ]);
    const cached = queryClient.getQueryData<ExecutionTasks>(taskKeys.byExecution(running.id));
    expect(cached?.items.at(-1)).toMatchObject({ id: "T-4", title: "Add e2e test for the toggle" });
  });

  it("validates the title and task ids", async () => {
    const bodies = captureBodies();
    const { user } = renderWithProviders(<AssignTaskForm executionId={running.id} />);
    await user.type(await screen.findByLabelText(/depends on/i), "first");
    await user.click(screen.getByRole("button", { name: "Assign task" }));
    expect(await screen.findByText(/give the task a title/i)).toBeInTheDocument();
    expect(screen.getByText(/task ids look like T-1/i)).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });
});
