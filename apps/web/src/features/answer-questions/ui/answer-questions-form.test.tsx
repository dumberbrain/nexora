import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { AnswerQuestionsForm } from "./answer-questions-form";
import { executionFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const execution = { ...executionFixtures[0]!, status: "configuring" as const };

describe("AnswerQuestionsForm", () => {
  it("renders each question with its recommended default", async () => {
    renderWithProviders(<AnswerQuestionsForm execution={execution} onSaved={vi.fn()} />);
    expect(await screen.findByRole("radio", { name: /^parallel/i })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: /maximum parallel sessions/i })).toHaveValue(3);
    expect(screen.getByRole("checkbox", { name: "Yes" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "team-frontend" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "speckit-plan" })).not.toBeChecked();
  });

  it("rejects out-of-range numbers", async () => {
    const { user } = renderWithProviders(
      <AnswerQuestionsForm execution={execution} onSaved={vi.fn()} />,
    );
    const n = await screen.findByRole("spinbutton", { name: /maximum parallel sessions/i });
    await user.clear(n);
    await user.type(n, "12");
    await user.click(screen.getByRole("button", { name: /save answers/i }));
    expect(await screen.findByText("At most 8")).toBeInTheDocument();
  });

  it("saves the merged config", async () => {
    let body: unknown;
    server.use(
      http.put("*/api/v1/executions/:id/config", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(execution);
      }),
    );
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <AnswerQuestionsForm execution={execution} onSaved={onSaved} />,
    );
    await user.click(await screen.findByRole("radio", { name: /^sequential/i }));
    await user.click(screen.getByRole("checkbox", { name: "speckit-plan" }));
    await user.click(screen.getByRole("button", { name: /save answers/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(body).toMatchObject({
      config: {
        parallelism: "sequential",
        maxParallelSessions: 3,
        answers: { skills: ["team-frontend", "speckit-plan"], notes: "" },
      },
    });
  });

  it("lets the user continue when no questions are relevant", async () => {
    server.use(
      http.get("*/api/v1/executions/:id/questions", () => HttpResponse.json({ items: [] })),
    );
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <AnswerQuestionsForm execution={execution} onSaved={onSaved} />,
    );
    await user.click(await screen.findByRole("button", { name: /continue/i }));
    expect(onSaved).toHaveBeenCalledWith(execution);
  });
});
