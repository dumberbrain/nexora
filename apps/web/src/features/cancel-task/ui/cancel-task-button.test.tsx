import { type Task } from "@nexora/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";

import { CancelTaskButton } from "./cancel-task-button";
import { planFixture } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const queued: Task = { ...planFixture.items[0]!, status: "queued" };

describe("CancelTaskButton", () => {
  it("confirms, then cancels the task with the optional reason", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/v1/executions/:id/tasks/:taskId/cancel", async ({ request }) => {
        bodies.push(await request.clone().json());
        return undefined;
      }),
    );
    const { user } = renderWithProviders(<CancelTaskButton task={queued} />);
    await user.click(await screen.findByRole("button", { name: "Cancel T-1" }));
    const dialog = await screen.findByRole("dialog", { name: /cancel task T-1/i });
    await user.type(within(dialog).getByLabelText(/reason/i), "superseded by T-4");
    await user.click(within(dialog).getByRole("button", { name: "Cancel task" }));
    await waitFor(() => expect(bodies).toEqual([{ reason: "superseded by T-4" }]));
  });

  it("is unavailable for a finished task", async () => {
    renderWithProviders(<CancelTaskButton task={{ ...queued, status: "completed" }} />);
    const button = await screen.findByRole("button", { name: "Cancel T-1" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(/completed/);
  });
});
