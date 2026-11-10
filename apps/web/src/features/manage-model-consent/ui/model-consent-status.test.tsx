import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";

import { ModelConsentStatus } from "./model-consent-status";
import { projectFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const [ubuliera, billing] = projectFixtures as [
  (typeof projectFixtures)[0],
  (typeof projectFixtures)[0],
];

describe("ModelConsentStatus", () => {
  it("shows a remembered consent and revokes it with PUT { alwaysAllow: false }", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/v1/projects/:id/model-consent", async ({ request }) => {
        bodies.push(await request.clone().json());
        return undefined;
      }),
    );
    const { user } = renderWithProviders(<ModelConsentStatus project={ubuliera} />);
    const status = await screen.findByRole("group", { name: /model usage/i });
    await waitFor(() => expect(status).toHaveTextContent(/always allowed/i));
    await user.click(
      screen.getByRole("button", { name: "Revoke model-usage consent for ubuliera" }),
    );
    await waitFor(() => expect(status).toHaveTextContent(/asks every time/i));
    expect(bodies).toEqual([{ alwaysAllow: false }]);
    expect(
      screen.queryByRole("button", { name: /revoke model-usage consent/i }),
    ).not.toBeInTheDocument();
  });

  it("says consent is asked every time when nothing is remembered", async () => {
    renderWithProviders(<ModelConsentStatus project={billing} />);
    const status = await screen.findByRole("group", { name: /model usage/i });
    await waitFor(() => expect(status).toHaveTextContent(/asks every time/i));
  });
});
