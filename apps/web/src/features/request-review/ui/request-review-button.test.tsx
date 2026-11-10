import { screen, waitFor, within } from "@testing-library/react";
import { type Task } from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { RequestReviewButton } from "./request-review-button";
import { planFixture } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const done: Task = { ...planFixture.items[0]!, status: "completed" };

describe("RequestReviewButton", () => {
  it("requests a Code Reviewer review with an optional note", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/v1/executions/:id/tasks/:taskId/review", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json<Task>({ ...done, status: "reviewing" });
      }),
    );
    const { user } = renderWithProviders(<RequestReviewButton task={done} />);
    await user.click(await screen.findByRole("button", { name: "Request review of T-1" }));
    const dialog = await screen.findByRole("dialog", { name: /request a review/i });
    await user.type(within(dialog).getByLabelText(/note/i), "check the store migration");
    await user.click(within(dialog).getByRole("button", { name: "Request review" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bodies).toEqual([{ note: "check the store migration" }]);
  });

  it("keeps the dialog open and shows why the request failed", async () => {
    server.use(
      http.post("*/api/v1/executions/:id/tasks/:taskId/review", () =>
        HttpResponse.json(
          { error: { code: "CONFLICT", message: "a review is already running" } },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderWithProviders(<RequestReviewButton task={done} />);
    await user.click(await screen.findByRole("button", { name: "Request review of T-1" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Request review" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "a review is already running",
    );
  });

  it("is unavailable until the task completed", async () => {
    renderWithProviders(<RequestReviewButton task={planFixture.items[0]!} />);
    expect(await screen.findByRole("button", { name: "Request review of T-1" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
