import { GITHUB_AUTH_HINT, GITHUB_INSTALL_HINT, type GithubStatus } from "@nexora/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GithubView } from "./github-view";
import { githubBranchFixtures, githubStatusFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";
import { type GithubSearch } from "../model/github-search";

function Harness({
  initial = {},
  onChange,
}: {
  initial?: GithubSearch;
  onChange?: (next: GithubSearch) => void;
}) {
  const [search, setSearch] = useState<GithubSearch>(initial);
  return (
    <GithubView
      search={search}
      onSearchChange={(next) => {
        onChange?.(next);
        setSearch(next);
      }}
    />
  );
}

const useStatus = (status: GithubStatus) =>
  server.use(http.get("*/api/v1/github/status", () => HttpResponse.json(status)));

/** Paths of every /github request after /status. */
function recordRepoRequests(): string[] {
  const seen: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const path = new URL(request.url).pathname;
    if (path.includes("/github/") && !path.endsWith("/github/status")) seen.push(path);
  });
  return seen;
}

afterEach(() => server.events.removeAllListeners());

describe("GithubView", () => {
  it("connected: shows status, repo picker, branches, commits and PRs with review status", async () => {
    renderWithProviders(<Harness />);
    const status = await screen.findByRole("region", { name: "GitHub status" });
    expect(within(status).getByText("connected")).toBeInTheDocument();
    expect(within(status).getByText("octo-dev")).toBeInTheDocument();

    const picker = await screen.findByRole("combobox", { name: "Repository" });
    await waitFor(() => expect(picker).toHaveValue("acme/nexora"));

    const branches = await screen.findByRole("list", { name: "Branches" });
    expect(within(branches).getByText("main")).toBeInTheDocument();
    expect(within(branches).getByText("default")).toBeInTheDocument();
    expect(within(branches).getByText("protected")).toBeInTheDocument();
    expect(screen.queryByText("local git")).not.toBeInTheDocument();

    const commits = await screen.findByRole("list", { name: "Commits" });
    expect(within(commits).getByText("feat(web): integrations view")).toBeInTheDocument();
    expect(within(commits).queryByText(/Long body/)).not.toBeInTheDocument();

    const pulls = await screen.findByRole("list", { name: "Pull requests" });
    const pr12 = within(pulls).getByRole("listitem", { name: "#12 Add integrations inventory" });
    expect(within(pr12).getByText("review: approved")).toBeInTheDocument();
    const pr13 = within(pulls).getByRole("listitem", { name: "#13 GitHub view" });
    expect(within(pr13).getByText("review: changes requested")).toBeInTheDocument();
    expect(within(pr13).getByText("draft")).toBeInTheDocument();
  });

  it("opens a PR's changed files", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness onChange={onChange} />);
    const pulls = await screen.findByRole("list", { name: "Pull requests" });
    await user.click(within(pulls).getByRole("button", { name: "Show files of #12" }));
    expect(onChange).toHaveBeenLastCalledWith({ repo: "acme/nexora", pull: 12 });

    const files = await screen.findByRole("list", { name: "Changed files of #12" });
    expect(within(files).getByText("README.md")).toBeInTheDocument();
    expect(within(files).getByText("+2")).toBeInTheDocument();
    expect(within(files).getByText("-1")).toBeInTheDocument();
  });

  it("switches commits to a branch picked in the branch list", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness onChange={onChange} />);
    const branches = await screen.findByRole("list", { name: "Branches" });
    await user.click(within(branches).getByRole("button", { name: "feat/us7-web" }));
    expect(onChange).toHaveBeenLastCalledWith({ repo: "acme/nexora", branch: "feat/us7-web" });
    expect(await screen.findByRole("heading", { name: "Commits on feat/us7-web" })).toBeVisible();
  });

  it("marks branches and commits served by the local git fallback", async () => {
    server.use(
      http.get("*/api/v1/github/repos/:owner/:repo/branches", () =>
        HttpResponse.json({ ...githubBranchFixtures, source: "local_git" }),
      ),
    );
    renderWithProviders(<Harness />);
    const section = await screen.findByRole("region", { name: "Branches" });
    expect(await within(section).findByText("local git")).toBeInTheDocument();
  });

  it("not_installed: shows install guidance with a copyable command and never queries repos", async () => {
    useStatus(githubStatusFixtures.notInstalled);
    const seen = recordRepoRequests();
    const { user } = renderWithProviders(<Harness />);
    const card = await screen.findByRole("region", { name: "Install the GitHub CLI" });
    expect(within(card).getByText(GITHUB_INSTALL_HINT)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: `Copy ${GITHUB_INSTALL_HINT}` }));
    expect(await navigator.clipboard.readText()).toBe(GITHUB_INSTALL_HINT);
    expect(
      within(card).getByRole("button", { name: `Copied ${GITHUB_INSTALL_HINT}` }),
    ).toBeVisible();
    // the follow-up sign-in step is listed too
    expect(within(card).getByText(GITHUB_AUTH_HINT)).toBeInTheDocument();

    expect(screen.queryByRole("combobox", { name: "Repository" })).not.toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it("not_authenticated: shows the sign-in command and re-checks status on demand", async () => {
    useStatus(githubStatusFixtures.notAuthenticated);
    const seen = recordRepoRequests();
    const { user } = renderWithProviders(<Harness />);
    const card = await screen.findByRole("region", { name: "Sign in to GitHub" });
    expect(within(card).getByText(GITHUB_AUTH_HINT)).toBeInTheDocument();
    expect(within(card).queryByText(GITHUB_INSTALL_HINT)).not.toBeInTheDocument();
    expect(seen).toEqual([]);

    useStatus(githubStatusFixtures.connected);
    await user.click(within(card).getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("list", { name: "Branches" })).toBeInTheDocument();
  });

  it("shows redacted commit text as a marker, never a secret", async () => {
    server.use(
      http.get("*/api/v1/github/repos/:owner/:repo/commits", () =>
        HttpResponse.json({
          source: "github",
          items: [
            {
              sha: "ffff0000",
              message: "chore: rotate key [REDACTED]",
              author: null,
              date: null,
              url: null,
            },
          ],
        }),
      ),
    );
    renderWithProviders(<Harness />);
    const commits = await screen.findByRole("list", { name: "Commits" });
    expect(await within(commits).findByText("chore: rotate key [REDACTED]")).toBeInTheDocument();
  });
});
