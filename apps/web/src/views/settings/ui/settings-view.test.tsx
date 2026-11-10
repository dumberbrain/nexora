import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { SettingsView } from "./settings-view";
import { CREATED_TOKEN_SECRET, MCP_ENDPOINT } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const region = (name: string) => screen.findByRole("region", { name });

describe("SettingsView — MCP server", () => {
  it("is off by default and explains the endpoint and the control-token limits", async () => {
    renderWithProviders(<SettingsView />);
    const mcp = await region("MCP server");
    const toggle = await within(mcp).findByRole("switch", { name: "Enable MCP server" });
    expect(toggle).not.toBeChecked();
    expect(within(mcp).getByText("disabled")).toBeInTheDocument();
    expect(within(mcp).getByText(MCP_ENDPOINT)).toBeInTheDocument();
    expect(within(mcp).getByText(/never approve risky tasks/i)).toBeInTheDocument();
  });

  it("enables and disables the server with PUT /settings/mcp", async () => {
    const bodies: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PUT" && request.url.endsWith("/settings/mcp")) {
        void request
          .clone()
          .json()
          .then((b) => bodies.push(b));
      }
    });
    const { user } = renderWithProviders(<SettingsView />);
    const mcp = await region("MCP server");
    const toggle = await within(mcp).findByRole("switch", { name: "Enable MCP server" });

    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(within(mcp).getByText("enabled")).toBeInTheDocument();

    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(bodies).toEqual([{ enabled: true }, { enabled: false }]);
    server.events.removeAllListeners();
  });

  it("shows a failed toggle and keeps the previous state", async () => {
    server.use(
      http.put("*/api/v1/settings/mcp", () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "session only" } },
          { status: 403 },
        ),
      ),
    );
    const { user } = renderWithProviders(<SettingsView />);
    const mcp = await region("MCP server");
    const toggle = await within(mcp).findByRole("switch", { name: "Enable MCP server" });
    await user.click(toggle);
    expect(await within(mcp).findByRole("alert")).toHaveTextContent("session only");
    expect(toggle).not.toBeChecked();
  });
});

describe("SettingsView — API tokens", () => {
  it("lists tokens with scope, dates and greyed-out revoked ones", async () => {
    renderWithProviders(<SettingsView />);
    const list = await screen.findByRole("list", { name: "API tokens" });
    const active = within(list).getByRole("listitem", { name: "claude-desktop" });
    expect(within(active).getByText("scope: control")).toBeInTheDocument();
    expect(within(active).getByText(/last used/i)).toBeInTheDocument();
    expect(
      within(active).getByRole("button", { name: "Revoke token claude-desktop" }),
    ).toBeEnabled();

    const revoked = within(list).getByRole("listitem", { name: "old-ci" });
    expect(within(revoked).getByText("scope: read")).toBeInTheDocument();
    expect(within(revoked).getByText("revoked")).toBeInTheDocument();
    expect(within(revoked).getByText("never used")).toBeInTheDocument();
    expect(revoked).toHaveAttribute("data-revoked", "true");
    expect(
      within(revoked).queryByRole("button", { name: "Revoke token old-ci" }),
    ).not.toBeInTheDocument();
  });

  it("validates the token name client-side", async () => {
    const { user } = renderWithProviders(<SettingsView />);
    const form = await screen.findByRole("form", { name: "Create API token" });
    await user.type(within(form).getByLabelText("Token name"), "has spaces");
    await user.click(within(form).getByRole("button", { name: "Create token" }));
    expect(
      await within(form).findByText("letters, digits, dot, underscore and dash only"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the secret exactly once with a copyable MCP command, then never again", async () => {
    const { user, queryClient } = renderWithProviders(<SettingsView />);
    const form = await screen.findByRole("form", { name: "Create API token" });
    await user.type(within(form).getByLabelText("Token name"), "cursor");
    await user.click(within(form).getByRole("radio", { name: /control/i }));
    await user.click(within(form).getByRole("button", { name: "Create token" }));

    const dialog = await screen.findByRole("dialog", { name: "Token created" });
    expect(within(dialog).getByText(/you will not see it again/i)).toBeInTheDocument();
    expect(within(dialog).getByText(CREATED_TOKEN_SECRET)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Copy token secret" }));
    expect(await navigator.clipboard.readText()).toBe(CREATED_TOKEN_SECRET);

    const command = `claude mcp add --transport http nexora ${MCP_ENDPOINT} --header "Authorization: Bearer ${CREATED_TOKEN_SECRET}"`;
    expect(within(dialog).getByText(command)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Copy MCP client command" }));
    expect(await navigator.clipboard.readText()).toBe(command);

    await user.click(within(dialog).getByRole("button", { name: "I saved it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // the new token is listed (without its secret)
    const list = screen.getByRole("list", { name: "API tokens" });
    const row = await within(list).findByRole("listitem", { name: "cursor" });
    expect(within(row).getByText("scope: control")).toBeInTheDocument();
    expect(screen.queryByText(CREATED_TOKEN_SECRET)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(CREATED_TOKEN_SECRET);
    // never cached: not in any query, and the create mutation is dropped once reset
    const cached = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain(CREATED_TOKEN_SECRET);
    await waitFor(() =>
      expect(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((m) => m.state.data),
        ),
      ).not.toContain(CREATED_TOKEN_SECRET),
    );
    // the form is reset for the next token
    expect(within(form).getByLabelText("Token name")).toHaveValue("");
  });

  it("shows a name conflict from the server on the name field", async () => {
    const { user } = renderWithProviders(<SettingsView />);
    const form = await screen.findByRole("form", { name: "Create API token" });
    await user.type(within(form).getByLabelText("Token name"), "claude-desktop");
    await user.click(within(form).getByRole("button", { name: "Create token" }));
    expect(
      await within(form).findByText("a token with this name already exists"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("revokes a token only after confirmation", async () => {
    const { user } = renderWithProviders(<SettingsView />);
    const list = await screen.findByRole("list", { name: "API tokens" });
    const row = within(list).getByRole("listitem", { name: "claude-desktop" });

    await user.click(within(row).getByRole("button", { name: "Revoke token claude-desktop" }));
    let confirm = await screen.findByRole("alertdialog", { name: "Revoke claude-desktop?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(row).toHaveAttribute("data-revoked", "false");

    await user.click(within(row).getByRole("button", { name: "Revoke token claude-desktop" }));
    confirm = await screen.findByRole("alertdialog", { name: "Revoke claude-desktop?" });
    await user.click(within(confirm).getByRole("button", { name: "Revoke token" }));
    await waitFor(() =>
      expect(within(list).getByRole("listitem", { name: "claude-desktop" })).toHaveAttribute(
        "data-revoked",
        "true",
      ),
    );
    expect(
      within(list).queryByRole("button", { name: "Revoke token claude-desktop" }),
    ).not.toBeInTheDocument();
  });
});

describe("SettingsView — remote access", () => {
  it("is read-only and names the env vars that control it", async () => {
    renderWithProviders(<SettingsView />);
    const remote = await region("Remote access");
    const facts = await within(remote).findByRole("list", { name: "Remote access status" });
    expect(within(facts).getByText("loopback only")).toBeInTheDocument();
    expect(within(facts).getByText("127.0.0.1")).toBeInTheDocument();
    expect(within(facts).getByText("3021")).toBeInTheDocument();
    expect(within(facts).getByText("not configured")).toBeInTheDocument();
    for (const name of ["NEXORA_REMOTE", "NEXORA_HOST", "NEXORA_PORT", "NEXORA_TOKEN"]) {
      expect(within(remote).getByText(name)).toBeInTheDocument();
    }
    expect(within(remote).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(remote).queryByRole("button")).not.toBeInTheDocument();
    expect(within(remote).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows an enabled remote bind", async () => {
    server.use(
      http.get("*/api/v1/settings", () =>
        HttpResponse.json({
          mcp: { enabled: true, endpoint: MCP_ENDPOINT },
          remote: { enabled: true, host: "0.0.0.0", port: 8443, envTokenConfigured: true },
        }),
      ),
    );
    renderWithProviders(<SettingsView />);
    const remote = await region("Remote access");
    const facts = await within(remote).findByRole("list", { name: "Remote access status" });
    expect(within(facts).getByText("enabled")).toBeInTheDocument();
    expect(within(facts).getByText("0.0.0.0")).toBeInTheDocument();
    expect(within(facts).getByText("configured")).toBeInTheDocument();
  });

  it("surfaces a failed settings load with a retry", async () => {
    server.use(
      http.get("*/api/v1/settings", () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "boom" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<SettingsView />);
    expect(await screen.findByText("Settings unavailable")).toBeInTheDocument();
  });
});
