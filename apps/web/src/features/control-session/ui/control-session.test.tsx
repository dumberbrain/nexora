import { screen, waitFor, within } from "@testing-library/react";
import { type Execution, type Session } from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { executionKeys } from "@/entities/execution";
import { sessionKeys } from "@/entities/session";

import { ExecutionControls } from "./execution-controls";
import { SessionControls } from "./session-controls";
import {
  executionFixtures,
  managedCapabilities,
  managedSessionFixture,
  sessionFixtures,
} from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const running = executionFixtures[1]!;

function captureControls(pattern: string) {
  const paths: string[] = [];
  server.use(
    http.post(pattern, ({ request }) => {
      paths.push(new URL(request.url).pathname);
      return undefined; // fall through to the default handler
    }),
  );
  return paths;
}

describe("SessionControls", () => {
  it("shows every control disabled with the observe-only reason for observed sessions", async () => {
    renderWithProviders(<SessionControls session={sessionFixtures[0]!} />);
    const bar = await screen.findByRole("toolbar", { name: /session controls/i });
    for (const name of ["Stop", "Interrupt & hold", "Resume", "Restart"]) {
      const button = within(bar).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAccessibleDescription(/observe-only/i);
    }
  });

  it("explains an unsupported control in a tooltip", async () => {
    const pty: Session = {
      ...managedSessionFixture,
      capabilities: { ...managedCapabilities, runtime: "agent_team_pty", canResume: false },
    };
    const { user } = renderWithProviders(<SessionControls session={pty} />);
    const pause = await screen.findByRole("button", { name: "Interrupt & hold" });
    expect(pause).toHaveAttribute("aria-disabled", "true");
    await user.hover(pause);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Not supported: Agent Teams (PTY) sessions cannot resume",
    );
    await user.click(pause);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for confirmation before stopping, then stops and patches the cache", async () => {
    const paths = captureControls("*/api/v1/sessions/:id/:control");
    const { user, queryClient } = renderWithProviders(
      <SessionControls session={managedSessionFixture} />,
    );
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    const dialog = await screen.findByRole("dialog", { name: /stop this session/i });
    expect(paths).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: /stop now/i }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<Session>(sessionKeys.detail(managedSessionFixture.id)),
      ).toMatchObject({ status: "stopped" }),
    );
    expect(paths).toEqual([`/api/v1/sessions/${managedSessionFixture.id}/stop`]);
  });

  it("interrupts and holds a running session without confirmation", async () => {
    const paths = captureControls("*/api/v1/sessions/:id/:control");
    const { user } = renderWithProviders(<SessionControls session={managedSessionFixture} />);
    await user.click(await screen.findByRole("button", { name: "Interrupt & hold" }));
    await waitFor(() =>
      expect(paths).toEqual([`/api/v1/sessions/${managedSessionFixture.id}/interrupt`]),
    );
  });

  it("surfaces a refused control", async () => {
    server.use(
      http.post("*/api/v1/sessions/:id/interrupt", () =>
        HttpResponse.json(
          { error: { code: "CAPABILITY_UNSUPPORTED", message: "runtime cannot interrupt now" } },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderWithProviders(<SessionControls session={managedSessionFixture} />);
    await user.click(await screen.findByRole("button", { name: "Interrupt & hold" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("runtime cannot interrupt now");
  });
});

describe("ExecutionControls", () => {
  it("derives execution controls from the execution's sessions", async () => {
    renderWithProviders(<ExecutionControls execution={running} />);
    const bar = await screen.findByRole("toolbar", { name: /execution controls/i });
    await waitFor(() =>
      expect(within(bar).getByRole("button", { name: "Interrupt & hold" })).not.toHaveAttribute(
        "aria-disabled",
      ),
    );
    expect(within(bar).getByRole("button", { name: "Stop" })).not.toHaveAttribute("aria-disabled");
    expect(within(bar).getByRole("button", { name: "Resume" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("interrupts & holds the execution and patches its cache", async () => {
    const { user, queryClient } = renderWithProviders(<ExecutionControls execution={running} />);
    const pause = await screen.findByRole("button", { name: "Interrupt & hold" });
    await waitFor(() => expect(pause).not.toHaveAttribute("aria-disabled"));
    await user.click(pause);
    await waitFor(() =>
      expect(queryClient.getQueryData<Execution>(executionKeys.detail(running.id))).toMatchObject({
        status: "paused",
      }),
    );
  });

  it("confirms before stopping the whole execution", async () => {
    const paths = captureControls("*/api/v1/executions/:id/stop");
    const { user } = renderWithProviders(<ExecutionControls execution={running} />);
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    const dialog = await screen.findByRole("dialog", { name: /stop this execution/i });
    await user.click(within(dialog).getByRole("button", { name: /stop now/i }));
    await waitFor(() => expect(paths).toEqual([`/api/v1/executions/${running.id}/stop`]));
  });
});
