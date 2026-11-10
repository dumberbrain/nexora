import { act, screen, waitFor, within } from "@testing-library/react";
import { type MessageList } from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { getLiveSocket } from "@/shared/socket/client";

import { MessageFeed } from "./ui/message-feed";
import { type FakeSocket } from "../../../tests/fake-socket";
import { makeEvent, messageFixtures } from "../../../tests/msw/handlers";
import { server } from "../../../tests/msw/server";
import { renderWithProviders } from "../../../tests/render";

vi.mock("@/shared/socket/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { FakeSocket } = await import("../../../tests/fake-socket");
  const socket = new FakeSocket();
  return { ...actual, getLiveSocket: () => socket };
});

const fake = () => getLiveSocket() as unknown as FakeSocket;
const X002 = messageFixtures[0]!.executionId!;

describe("MessageFeed", () => {
  it("shows sender, receiver, time, type, related task and summary", async () => {
    renderWithProviders(<MessageFeed filters={{}} onFiltersChange={() => {}} />);
    const feed = await screen.findByRole("list", { name: "Messages" });
    const rows = within(feed).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const q = rows[0]!;
    expect(q).toHaveTextContent("backend-dev");
    expect(q).toHaveTextContent("coordinator");
    expect(q).toHaveTextContent(/question/i);
    expect(q).toHaveTextContent("T-2");
    expect(q).toHaveTextContent("Should the legacy settings table be dropped or archived?");
    expect(within(q).getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("you");
  });

  it("states that private reasoning is never shown", async () => {
    renderWithProviders(<MessageFeed filters={{}} onFiltersChange={() => {}} />);
    expect(await screen.findByText(/private reasoning is never shown/i)).toBeInTheDocument();
  });

  it("filters by message type", async () => {
    const onFiltersChange = vi.fn();
    const { user } = renderWithProviders(
      <MessageFeed filters={{}} onFiltersChange={onFiltersChange} />,
    );
    await user.selectOptions(await screen.findByLabelText(/type/i), "question");
    expect(onFiltersChange).toHaveBeenCalledWith({ type: "question" });
  });

  it("prepends messages sent live over the socket", async () => {
    renderWithProviders(<MessageFeed filters={{ executionId: X002 }} onFiltersChange={() => {}} />);
    const feed = await screen.findByRole("list", { name: "Messages" });
    await waitFor(() =>
      expect(fake().sent).toContainEqual({
        event: "subscribe",
        payload: { scope: "execution", id: X002 },
      }),
    );
    act(() =>
      fake().pushEvents([
        makeEvent({
          id: "01JCXK0000000000000000E950",
          type: "message.sent",
          executionId: X002,
          taskId: "T-3",
          summary: "Wire the toggle after T-1 lands",
          payload: {
            messageId: "01JCXK0000000000000000M950",
            from: { kind: "coordinator" },
            to: { kind: "agent", agentId: "frontend-dev" },
            type: "instruction",
          },
        }),
      ]),
    );
    await waitFor(() => expect(within(feed).getAllByRole("listitem")).toHaveLength(4));
    expect(within(feed).getAllByRole("listitem")[0]).toHaveTextContent(
      "Wire the toggle after T-1 lands",
    );
  });

  it("explains an empty feed", async () => {
    server.use(
      http.get("*/api/v1/messages", () =>
        HttpResponse.json<MessageList>({ items: [], nextCursor: null }),
      ),
    );
    renderWithProviders(<MessageFeed filters={{}} onFiltersChange={() => {}} />);
    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });
});
