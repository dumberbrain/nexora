import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamLeadTerminal } from "./team-lead-terminal";
import { FakeTerminalSocket } from "../../../../tests/fake-terminal-socket";
import { FakeTerminal } from "../../../../tests/fake-xterm";
import { TEAM_LEAD_SESSION_ID, teamLeadSessionFixture } from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";

const sockets = vi.hoisted(() => ({ current: null as FakeTerminalSocket | null }));

vi.mock("@xterm/xterm", async () => ({
  Terminal: (await import("../../../../tests/fake-xterm")).FakeTerminal,
}));
vi.mock("@xterm/addon-fit", async () => ({
  FitAddon: (await import("../../../../tests/fake-xterm")).FakeFitAddon,
}));
vi.mock("../api/terminal-socket", () => ({
  createTerminalSocket: () => sockets.current,
  connectTerminalSocket: (s: FakeTerminalSocket) => {
    s.connect();
    return Promise.resolve();
  },
}));

let socket: FakeTerminalSocket;

beforeEach(() => {
  socket = new FakeTerminalSocket();
  sockets.current = socket;
  FakeTerminal.instances = [];
});

function renderTerminal(session = teamLeadSessionFixture) {
  return renderWithProviders(<TeamLeadTerminal session={session} />);
}

describe("TeamLeadTerminal", () => {
  it("is a labelled region with a focus button and an escape hint", async () => {
    const { user } = renderTerminal();
    const region = await screen.findByRole("region", { name: "Team lead terminal" });
    expect(region).toHaveTextContent(/press f6 to move focus out of the terminal/i);
    await user.click(within(region).getByRole("button", { name: "Focus terminal" }));
    expect(within(region).getByLabelText("Terminal input")).toHaveFocus();
  });

  it("attaches to the lead session with the terminal size and writes the backlog", async () => {
    socket.attachAck = { ok: true, backlog: "Welcome to Claude Code\r\n" };
    renderTerminal();
    await waitFor(() => expect(socket.sentOf("terminal:attach")).toHaveLength(1));
    expect(socket.sentOf("terminal:attach")[0]).toEqual({
      sessionId: TEAM_LEAD_SESSION_ID,
      cols: 80,
      rows: 24,
    });
    expect(FakeTerminal.last().written).toBe("Welcome to Claude Code\r\n");
    expect(await screen.findByText(/attached/i)).toBeInTheDocument();
  });

  it("streams output for this session only and sends keystrokes and resizes", async () => {
    renderTerminal();
    await waitFor(() => expect(socket.sentOf("terminal:attach")).toHaveLength(1));
    const term = FakeTerminal.last();
    act(() => {
      socket.serverEmit("terminal:output", { sessionId: TEAM_LEAD_SESSION_ID, data: "hello" });
      socket.serverEmit("terminal:output", { sessionId: "someone-else", data: "nope" });
    });
    expect(term.written).toBe("hello");

    act(() => term.type("1\r"));
    expect(socket.sentOf("terminal:input")).toEqual([
      { sessionId: TEAM_LEAD_SESSION_ID, data: "1\r" },
    ]);
    act(() => term.resize(120, 40));
    expect(socket.sentOf("terminal:resize")).toEqual([
      { sessionId: TEAM_LEAD_SESSION_ID, cols: 120, rows: 40 },
    ]);
  });

  it("re-attaches after a reconnect without duplicating the screen", async () => {
    socket.attachAck = { ok: true, backlog: "screen" };
    renderTerminal();
    await waitFor(() => expect(socket.sentOf("terminal:attach")).toHaveLength(1));
    act(() => void socket.connect());
    expect(socket.sentOf("terminal:attach")).toHaveLength(2);
    expect(FakeTerminal.last().written).toBe("screen");
  });

  it("reports a refused attach", async () => {
    socket.attachAck = { ok: false, error: "not a Ubuliera-started lead session" };
    renderTerminal();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not a Ubuliera-started lead session/,
    );
  });

  it("shows when the lead process exited", async () => {
    renderTerminal();
    await waitFor(() => expect(socket.sentOf("terminal:attach")).toHaveLength(1));
    act(() => socket.serverEmit("terminal:exit", { sessionId: TEAM_LEAD_SESSION_ID, exitCode: 0 }));
    expect(await screen.findByText(/session ended \(exit code 0\)/i)).toBeInTheDocument();
  });

  it("F6 leaves the terminal for the focus button instead of reaching Claude Code", async () => {
    renderTerminal();
    const button = await screen.findByRole("button", { name: "Focus terminal" });
    const term = FakeTerminal.last();
    expect(term.press("a")).toBe(true);
    let handled = true;
    act(() => {
      handled = term.press("F6");
    });
    expect(handled).toBe(false);
    expect(button).toHaveFocus();
  });

  it("tells the user to answer the workspace-trust prompt while the lead is starting", async () => {
    renderTerminal({ ...teamLeadSessionFixture, status: "starting" });
    expect(await screen.findByRole("status", { name: /workspace trust/i })).toHaveTextContent(
      /answer the prompt in the terminal/i,
    );
  });

  it("does not show the trust notice once the lead runs", async () => {
    renderTerminal();
    await screen.findByRole("region", { name: "Team lead terminal" });
    expect(screen.queryByRole("status", { name: /workspace trust/i })).not.toBeInTheDocument();
  });

  it("disposes the terminal and the socket on unmount", async () => {
    const { unmount } = renderTerminal();
    await waitFor(() => expect(socket.sentOf("terminal:attach")).toHaveLength(1));
    const term = FakeTerminal.last();
    unmount();
    expect(term.disposed).toBe(true);
    expect(socket.disconnected).toBe(true);
    expect(socket.listenerCount("terminal:output")).toBe(0);
  });
});
