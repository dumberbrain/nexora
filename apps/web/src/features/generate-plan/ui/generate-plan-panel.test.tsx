import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { taskKeys } from "@/entities/task";

import { GeneratePlanPanel } from "./generate-plan-panel";
import { executionFixtures, planFixture } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const id = executionFixtures[0]!.id;

function capturePlanRequests() {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/v1/executions/:id/plan", async ({ request }) => {
      const body = (await request.json()) as { modelAssisted: boolean; consent: boolean };
      bodies.push(body);
      if (body.modelAssisted && !body.consent) {
        return HttpResponse.json(
          { error: { code: "APPROVAL_REQUIRED", message: "consent needed" } },
          { status: 428 },
        );
      }
      return HttpResponse.json(planFixture);
    }),
  );
  return bodies;
}

describe("GeneratePlanPanel", () => {
  it("generates a local plan without model usage by default", async () => {
    const bodies = capturePlanRequests();
    const onGenerated = vi.fn();
    const { user, queryClient } = renderWithProviders(
      <GeneratePlanPanel executionId={id} projectName="ubuliera" onGenerated={onGenerated} />,
    );
    await user.click(await screen.findByRole("button", { name: /generate plan/i }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(planFixture));
    expect(bodies).toEqual([
      { modelAssisted: false, consent: false, rememberConsentForProject: false },
    ]);
    expect(queryClient.getQueryData(taskKeys.byExecution(id))).toEqual(planFixture);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for consent before model-assisted planning and can remember it per project", async () => {
    const bodies = capturePlanRequests();
    const onGenerated = vi.fn();
    const { user } = renderWithProviders(
      <GeneratePlanPanel executionId={id} projectName="ubuliera" onGenerated={onGenerated} />,
    );
    await user.click(await screen.findByRole("switch", { name: /model-assisted planning/i }));
    await user.click(screen.getByRole("button", { name: /generate plan/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/will consume model usage/i);
    await user.click(screen.getByRole("checkbox", { name: /always allow model usage/i }));
    await user.click(screen.getByRole("button", { name: /use model usage/i }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledOnce());
    expect(bodies).toEqual([
      { modelAssisted: true, consent: false, rememberConsentForProject: false },
      { modelAssisted: true, consent: true, rememberConsentForProject: true },
    ]);
  });

  it("runs nothing more when consent is cancelled", async () => {
    const bodies = capturePlanRequests();
    const { user } = renderWithProviders(
      <GeneratePlanPanel executionId={id} projectName="ubuliera" />,
    );
    await user.click(await screen.findByRole("switch", { name: /model-assisted planning/i }));
    await user.click(screen.getByRole("button", { name: /generate plan/i }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bodies).toHaveLength(1);
  });
});
