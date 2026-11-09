import { type ExecutionTasks, type Task } from "@nexora/contracts";
import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";

import { taskKeys } from "@/entities/task";

import { RetryTaskButton } from "./retry-task-button";
import { planFixture } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const failed: Task = { ...planFixture.items[1]!, status: "failed" };

describe("RetryTaskButton", () => {
  it("retries a failed task and records the new attempt in the cache", async () => {
    const paths: string[] = [];
    server.use(
      http.post("*/api/v1/executions/:id/tasks/:taskId/retry", ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return undefined;
      }),
    );
    const { user, queryClient } = renderWithProviders(<RetryTaskButton task={failed} />);
    queryClient.setQueryData(taskKeys.byExecution(failed.executionId), {
      ...planFixture,
      items: [planFixture.items[0]!, failed],
    });
    await user.click(await screen.findByRole("button", { name: "Retry T-2" }));
    await waitFor(() =>
      expect(paths).toEqual([`/api/v1/executions/${failed.executionId}/tasks/T-2/retry`]),
    );
    await waitFor(() => {
      const cached = queryClient.getQueryData<ExecutionTasks>(
        taskKeys.byExecution(failed.executionId),
      );
      expect(cached?.items.find((t) => t.id === "T-2")).toMatchObject({ attempt: 2 });
    });
  });

  it("is unavailable with a reason while the task has not failed", async () => {
    renderWithProviders(<RetryTaskButton task={planFixture.items[0]!} />);
    const button = await screen.findByRole("button", { name: "Retry T-1" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(/only failed or cancelled tasks/i);
  });
});
