import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";

import { messageKeys } from "@/entities/message";

import { SendMessageForm } from "./send-message-form";
import {
  agentFixtures,
  managedCapabilities,
  managedSessionFixture,
  sessionFixtures,
} from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

function captureBodies(pattern: string) {
  const bodies: Array<{ path: string; body: unknown }> = [];
  server.use(
    http.post(pattern, async ({ request }) => {
      bodies.push({ path: new URL(request.url).pathname, body: await request.clone().json() });
      return undefined;
    }),
  );
  return bodies;
}

describe("SendMessageForm", () => {
  it("sends a message to a session's main agent and refreshes the feed", async () => {
    const sent = captureBodies("*/api/v1/sessions/:id/messages");
    const { user, queryClient } = renderWithProviders(
      <SendMessageForm target={{ kind: "session", session: managedSessionFixture }} />,
    );
    queryClient.setQueryData(messageKeys.list({}), { items: [], nextCursor: null });
    await user.type(await screen.findByLabelText(/message to the main agent/i), " add tests ");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/sent/i);
    expect(sent).toEqual([
      {
        path: `/api/v1/sessions/${managedSessionFixture.id}/messages`,
        body: { text: "add tests" },
      },
    ]);
    expect(screen.getByLabelText(/message to the main agent/i)).toHaveValue("");
    await waitFor(() =>
      expect(queryClient.getQueryState(messageKeys.list({}))?.isInvalidated).toBe(true),
    );
  });

  it("sends to a specific agent", async () => {
    const sent = captureBodies("*/api/v1/agents/:id/messages");
    const agent = agentFixtures[1]!;
    const { user } = renderWithProviders(
      <SendMessageForm target={{ kind: "agent", agent, session: managedSessionFixture }} />,
    );
    await user.type(await screen.findByLabelText(/message to code-reviewer/i), "re-check T-4");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(sent.map((s) => s.path)).toEqual([
        `/api/v1/agents/${encodeURIComponent(agent.id)}/messages`,
      ]),
    );
  });

  it("validates an empty message", async () => {
    const { user } = renderWithProviders(
      <SendMessageForm target={{ kind: "session", session: managedSessionFixture }} />,
    );
    await user.click(await screen.findByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/write a message/i);
  });

  it("is unavailable for observe-only sessions and lead-only runtimes", async () => {
    const { unmount } = renderWithProviders(
      <SendMessageForm target={{ kind: "session", session: sessionFixtures[0]! }} />,
    );
    expect(await screen.findByRole("button", { name: "Send message" })).toHaveAccessibleDescription(
      /observe-only/i,
    );
    unmount();
    const leadOnly = {
      ...managedSessionFixture,
      capabilities: { ...managedCapabilities, canSendMessage: "lead_only" as const },
    };
    renderWithProviders(
      <SendMessageForm target={{ kind: "agent", agent: agentFixtures[1]!, session: leadOnly }} />,
    );
    const send = await screen.findByRole("button", { name: "Send message" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    expect(send).toHaveAccessibleDescription(/only the team lead/i);
  });
});
