import { type ApiErrorBody } from "@nexora/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLiveSocket } from "@/shared/socket/client";
import { Toaster } from "@/shared/ui/sonner";

import { KanbanBoard } from "./ui/kanban-board";
import { type FakeSocket } from "../../../tests/fake-socket";
import { makeEvent } from "../../../tests/msw/handlers";
import { server } from "../../../tests/msw/server";
import { renderWithProviders } from "../../../tests/render";

vi.mock("@/shared/socket/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { FakeSocket } = await import("../../../tests/fake-socket");
  const socket = new FakeSocket();
  return { ...actual, getLiveSocket: () => socket };
});

const fake = () => getLiveSocket() as unknown as FakeSocket;
const X002 = "01JCXK0000000000000000X002";
const COLUMNS = ["Backlog", "Todo", "In Progress", "Review", "Completed", "Failed"];

/*
 * jsdom has no layout. dnd-kit's keyboard sensor and collision detection work on client rects,
 * so lay the six columns out side by side (150px wide, 10px gap) and put every card at the top
 * of its column.
 */
function fakeLayout(this: HTMLElement): DOMRect {
  const column = this.closest<HTMLElement>("[data-board-column]");
  if (!column) return new DOMRect(0, 0, 0, 0);
  const left = Number(column.dataset.boardColumn) * 160;
  return column === this ? new DOMRect(left, 0, 150, 600) : new DOMRect(left + 5, 40, 140, 40);
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(fakeLayout);
  // dnd-kit scrolls the focused card into view on a keyboard drag; jsdom has no scrolling
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderBoard(
  filters: { executionId?: string; projectId?: string } = { executionId: X002 },
) {
  const onFiltersChange = vi.fn();
  const utils = renderWithProviders(
    <>
      <KanbanBoard filters={filters} onFiltersChange={onFiltersChange} />
      <Toaster />
    </>,
  );
  return { ...utils, onFiltersChange };
}

const column = (name: string) => screen.getByRole("list", { name });
const card = (name: string) => screen.getByRole("button", { name });

/** Keyboard drag: pick up, arrow across columns, drop — one keystroke at a time. */
async function keyboardMove(
  user: ReturnType<typeof renderBoard>["user"],
  name: string,
  arrows: string,
) {
  act(() => card(name).focus());
  await user.keyboard("[Space]");
  for (const key of arrows.split(",")) await user.keyboard(`[${key}]`);
  await user.keyboard("[Space]");
}

describe("KanbanBoard", () => {
  it("renders the six columns with every task in the column its status maps to", async () => {
    renderBoard();
    const board = await screen.findByRole("region", { name: "Task board" });
    await within(board).findByRole("button", { name: "T-1 Add theme store" });
    for (const name of COLUMNS) expect(within(board).getByRole("list", { name })).toBeVisible();

    const ids = (name: string) =>
      within(column(name))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")?.split(" ")[0]);
    expect(ids("Backlog")).toEqual(["T-1", "T-2"]);
    expect(ids("Todo")).toEqual(["T-3"]);
    expect(ids("In Progress")).toEqual(["T-4"]);
    expect(ids("Review")).toEqual(["T-5"]);
    expect(ids("Completed")).toEqual(["T-6"]);
    expect(ids("Failed")).toEqual(["T-7", "T-8"]);
  });

  it("only lets Backlog and Todo cards be dragged; others explain why", async () => {
    renderBoard();
    const running = await screen.findByRole("button", { name: "T-4 Persist preference" });
    expect(running).toHaveAttribute("aria-disabled", "true");
    expect(running).toHaveAccessibleDescription(/only backlog and todo/i);
    expect(card("T-1 Add theme store")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("links each card to its execution", async () => {
    renderBoard();
    await screen.findByRole("button", { name: "T-1 Add theme store" });
    const link = within(column("Backlog")).getAllByRole("link")[0]!;
    expect(link).toHaveAttribute("href", `/executions/${X002}`);
  });

  it("moves a Backlog card to Todo with the keyboard and saves it", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/v1/executions/:id/tasks/:taskId/status", async ({ request }) => {
        bodies.push({ path: new URL(request.url).pathname, body: await request.clone().json() });
        return undefined;
      }),
    );
    const { user, queryClient } = renderBoard();
    await screen.findByRole("button", { name: "T-1 Add theme store" });

    await keyboardMove(user, "T-1 Add theme store", "ArrowRight");

    await waitFor(() =>
      expect(
        within(column("Todo")).getByRole("button", { name: "T-1 Add theme store" }),
      ).toBeVisible(),
    );
    expect(bodies).toEqual([
      { path: `/api/v1/executions/${X002}/tasks/T-1/status`, body: { status: "queued" } },
    ]);
    // still in Todo once the board refetches the server's state
    await waitFor(() => expect(queryClient.isMutating() + queryClient.isFetching()).toBe(0));
    expect(
      within(column("Todo")).getByRole("button", { name: "T-1 Add theme store" }),
    ).toBeVisible();
  });

  it("announces pick-up, target column and drop for screen readers", async () => {
    const { user } = renderBoard();
    await screen.findByRole("button", { name: "T-3 Wire toggle into settings page" });
    act(() => card("T-3 Wire toggle into settings page").focus());
    await user.keyboard("[Space]");
    expect(await screen.findByText(/picked up T-3.*todo/i)).toBeInTheDocument();
    await user.keyboard("[ArrowLeft]");
    expect(await screen.findByText(/over backlog.*allowed/i)).toBeInTheDocument();
    await user.keyboard("[Space]");
    expect(await screen.findByText(/T-3 moved to backlog/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(column("Backlog")).getByRole("button", {
          name: "T-3 Wire toggle into settings page",
        }),
      ).toBeVisible(),
    );
  });

  it("visibly refuses drops outside Backlog ⇄ Todo without calling the server", async () => {
    const patch = vi.fn();
    server.use(
      http.patch("*/api/v1/executions/:id/tasks/:taskId/status", () => {
        patch();
        return undefined;
      }),
    );
    const { user } = renderBoard();
    await screen.findByRole("button", { name: "T-1 Add theme store" });
    act(() => card("T-1 Add theme store").focus());
    await user.keyboard("[Space]");
    await user.keyboard("[ArrowRight]");
    await user.keyboard("[ArrowRight]");
    expect(await screen.findByText(/over in progress.*refused/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "In Progress" })).toHaveAttribute(
      "data-drop",
      "refused",
    );
    expect(screen.getByRole("region", { name: "Todo" })).toHaveAttribute("data-drop", "allowed");
    await user.keyboard("[Space]");

    expect(await screen.findByText(/only backlog ⇄ todo/i)).toBeInTheDocument();
    expect(
      within(column("Backlog")).getByRole("button", { name: "T-1 Add theme store" }),
    ).toBeVisible();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rolls an optimistic move back and toasts the server's 409 reason", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.patch("*/api/v1/executions/:id/tasks/:taskId/status", async () => {
        await gate;
        return HttpResponse.json<ApiErrorBody>(
          { error: { code: "CONFLICT", message: "T-2 waits for T-1; queue T-1 first" } },
          { status: 409 },
        );
      }),
    );
    const { user } = renderBoard();
    await screen.findByRole("button", { name: "T-2 Drop legacy settings table" });

    await keyboardMove(user, "T-2 Drop legacy settings table", "ArrowRight");
    // optimistic: in Todo while the server decides
    await waitFor(() =>
      expect(
        within(column("Todo")).getByRole("button", { name: "T-2 Drop legacy settings table" }),
      ).toBeVisible(),
    );
    release();

    expect(await screen.findByText("T-2 waits for T-1; queue T-1 first")).toBeInTheDocument();
    expect(screen.getByText("Could not move T-2")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(column("Backlog")).getByRole("button", { name: "T-2 Drop legacy settings table" }),
      ).toBeVisible(),
    );
  });

  it("refetches the board when a live task event arrives", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/v1/tasks", () => {
        calls += 1;
        return undefined;
      }),
    );
    renderBoard();
    await screen.findByRole("button", { name: "T-1 Add theme store" });
    await waitFor(() =>
      expect(fake().sent).toContainEqual({
        event: "subscribe",
        payload: { scope: "execution", id: X002 },
      }),
    );
    const before = calls;
    act(() =>
      fake().pushEvents([
        makeEvent({
          id: "01JCXK0000000000000000E960",
          type: "task.completed",
          executionId: X002,
          taskId: "T-4",
          summary: "T-4 completed",
        }),
      ]),
    );
    await waitFor(() => expect(calls).toBe(before + 1));
  });

  it("filters by execution and project", async () => {
    const { user, onFiltersChange } = renderBoard({});
    await screen.findByRole("button", { name: "T-1 Fix flaky staleness test" });
    await waitFor(() =>
      expect(within(screen.getByLabelText("Execution")).getAllByRole("option").length).toBe(4),
    );
    await user.selectOptions(screen.getByLabelText("Execution"), X002);
    expect(onFiltersChange).toHaveBeenLastCalledWith({ executionId: X002 });
    await waitFor(() =>
      expect(within(screen.getByLabelText("Project")).getAllByRole("option").length).toBe(3),
    );
    await user.selectOptions(screen.getByLabelText("Project"), "01JCXK0000000000000000P001");
    expect(onFiltersChange).toHaveBeenLastCalledWith({ projectId: "01JCXK0000000000000000P001" });
  });

  it("explains an empty board", async () => {
    server.use(http.get("*/api/v1/tasks", () => HttpResponse.json({ items: [] })));
    renderBoard();
    expect(await screen.findByText(/no tasks on this board/i)).toBeInTheDocument();
  });
});
