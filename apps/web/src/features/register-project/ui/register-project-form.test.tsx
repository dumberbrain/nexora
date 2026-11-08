import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { projectKeys } from "@/entities/project";

import { RegisterProjectForm } from "./register-project-form";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

describe("RegisterProjectForm", () => {
  it("rejects relative paths client-side without calling the API", async () => {
    const posted = vi.fn<() => void>();
    server.use(
      http.post("*/api/v1/projects", () => {
        posted();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<RegisterProjectForm />);
    await user.type(await screen.findByLabelText(/project folder/i), "relative/dir");
    await user.click(screen.getByRole("button", { name: /register project/i }));
    expect(await screen.findByText("must be an absolute path")).toBeInTheDocument();
    expect(screen.getByLabelText(/project folder/i)).toHaveAttribute("aria-invalid", "true");
    expect(posted).not.toHaveBeenCalled();
  });

  it("shows a 409 from the server on the path field", async () => {
    const { user } = renderWithProviders(<RegisterProjectForm />);
    await user.type(await screen.findByLabelText(/project folder/i), "C:/work/nexora");
    await user.click(screen.getByRole("button", { name: /register project/i }));
    expect(await screen.findByText("This folder is already registered.")).toBeInTheDocument();
  });

  it("posts trimmed input, omits an empty name and refreshes the project list", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/v1/projects", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: "01JCXK0000000000000000P009", name: "app" },
          { status: 201 },
        );
      }),
    );
    const onRegistered = vi.fn();
    const { user, queryClient } = renderWithProviders(
      <RegisterProjectForm onRegistered={onRegistered} />,
    );
    queryClient.setQueryData(projectKeys.lists(), { items: [] });
    await user.type(await screen.findByLabelText(/project folder/i), "/home/me/app");
    await user.click(screen.getByRole("button", { name: /register project/i }));
    await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    expect(body).toEqual({ rootPath: "/home/me/app" });
    expect(queryClient.getQueryState(projectKeys.lists())?.isInvalidated).toBe(true);
  });
});
