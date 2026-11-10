import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { InstallHooksDialog } from "./install-hooks-dialog";
import { projectFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const notInstalled = projectFixtures[1]!;
const installed = projectFixtures[0]!;

function spyWrites() {
  const install = vi.fn<(body: unknown) => void>();
  const uninstall = vi.fn();
  server.use(
    http.post("*/api/v1/projects/:id/hooks/install", async ({ request }) => {
      install(await request.json());
      return HttpResponse.json({ ok: true });
    }),
    http.delete("*/api/v1/projects/:id/hooks", () => {
      uninstall();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { install, uninstall };
}

describe("InstallHooksDialog", () => {
  it("shows the settings path and diff and writes nothing until confirm is clicked", async () => {
    const { install } = spyWrites();
    const { user } = renderWithProviders(<InstallHooksDialog project={notInstalled} />);
    await user.click(await screen.findByRole("button", { name: /install hooks for billing-api/i }));

    expect(await screen.findByText(/settings\.local\.json/)).toBeInTheDocument();
    const diff = screen.getByLabelText("Settings file diff");
    expect(diff).toHaveTextContent('added: "hooks": {');
    expect(install).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(install).not.toHaveBeenCalled();
  });

  it("installs with confirm: true on the explicit click and closes", async () => {
    const { install } = spyWrites();
    const { user } = renderWithProviders(<InstallHooksDialog project={notInstalled} />);
    await user.click(await screen.findByRole("button", { name: /install hooks for billing-api/i }));
    await user.click(await screen.findByRole("button", { name: /confirm & install hooks/i }));
    await waitFor(() => expect(install).toHaveBeenCalledWith({ confirm: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers uninstall when hooks are already installed", async () => {
    const { install, uninstall } = spyWrites();
    const { user } = renderWithProviders(<InstallHooksDialog project={installed} />);
    await user.click(await screen.findByRole("button", { name: /manage hooks for ubuliera/i }));
    await user.click(await screen.findByRole("button", { name: /uninstall hooks/i }));
    await waitFor(() => expect(uninstall).toHaveBeenCalledOnce());
    expect(install).not.toHaveBeenCalled();
  });
});
