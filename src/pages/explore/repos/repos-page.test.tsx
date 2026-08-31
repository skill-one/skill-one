import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter, Route, Routes } from "react-router";

import type { Skill } from "../../../types/skill";
import { createRegistryClientMock } from "../../../test/registry-harness";
import type { RegistryHarness } from "../../../test/registry-harness";
import { ExplorePage } from "../explore-page";
import { ReposPage } from "./repos-page";
import { RepoDetailPage } from "./repo-detail-page";

/**
 * The registry client is replaced by a real-controller-driven harness, so
 * the page tests exercise the exact RPC/event contract the worker speaks.
 */
vi.mock("../../../lib/registry/client", async () => {
  const { createRegistryHarness, createRegistryClientMock } =
    await import("../../../test/registry-harness");
  return createRegistryClientMock(createRegistryHarness());
});

const harness = (
  (await import("../../../lib/registry/client")) as unknown as {
    __harness: RegistryHarness;
  }
).__harness;

/** Skills spread over repos: alpha has 2 skills (10 stars), beta 1 skill
 * but the most stars (50), git/x 1 skill (1 star) — so the default star
 * order differs from the skills order. */
const repoSkills: Skill[] = [
  {
    name: "a1",
    repo: "acme/alpha",
    description: "",
    stars: 10,
    downloads: 50,
  },
  {
    name: "a2",
    repo: "acme/alpha",
    description: "",
    stars: 10,
    downloads: 30,
  },
  {
    name: "b1",
    repo: "acme/beta",
    description: "",
    stars: 50,
    downloads: 100,
  },
  {
    name: "g1",
    repo: "git/x",
    description: "",
    stars: 1,
    downloads: 1,
  },
];

/** `count` single-skill repos named `repo-NN/skills` (zero-padded, so the
 * worker's name tie-break keeps numeric order across pages). */
function makeSingleSkillRepos(count: number): Skill[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    repo: `repo-${String(i).padStart(2, "0")}/skills`,
    description: "",
    stars: 1,
    downloads: 1,
  }));
}

function bootRegistry(skills: Skill[]) {
  harness.reset();
  harness.init();
  harness.pushAll(skills);
  harness.complete();
}

let queryClient: QueryClient;

function renderReposPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/explore/repos" element={<ReposPage />} />
          <Route
            path="/explore/repos/:owner/:repo"
            element={<RepoDetailPage />}
          />
          <Route path="/explore" element={<ExplorePage />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10 * 60 * 1000, retry: false } },
  });
  harness.reset();
  // Mount at the repos route; a bare hash leaves the Routes empty.
  window.history.replaceState(null, "", "#/explore/repos");
});

describe("ReposPage", () => {
  it("renders one card per repo with its star count, skill count and the total", async () => {
    bootRegistry(repoSkills);
    renderReposPage();

    expect(await screen.findByText("acme/alpha")).toBeInTheDocument();
    expect(screen.getByText("acme/beta")).toBeInTheDocument();
    expect(screen.getByText("git/x")).toBeInTheDocument();
    // The star count sits in the card header, next to the repo name.
    expect(screen.getByLabelText("Star 数 50")).toBeInTheDocument();
    expect(screen.getByLabelText("Star 数 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Star 数 1")).toBeInTheDocument();
    // Every card carries the "N 个 Skill" count line.
    expect(screen.getAllByText("个 Skill")).toHaveLength(3);
    expect(screen.getByText("共 3 个仓库")).toBeInTheDocument();
  });

  it("keeps the skeleton up until the whole registry has landed", async () => {
    harness.init();
    const { container } = renderReposPage();
    await act(async () => {});

    // Repo counts are meaningless over a partial index: no card is painted
    // before `ready`, only card-shaped skeletons.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      12,
    );
    expect(screen.queryByText("acme/alpha")).not.toBeInTheDocument();

    harness.pushAll(repoSkills);
    harness.complete();
    expect(await screen.findByText("acme/alpha")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("filters repos by search text and resets to the first page", async () => {
    const user = userEvent.setup();
    bootRegistry(repoSkills);
    renderReposPage();
    await screen.findByText("acme/alpha");

    await user.type(screen.getByRole("textbox", { name: "搜索仓库" }), "alpha");

    expect(await screen.findByText("共 1 个仓库")).toBeInTheDocument();
    expect(screen.getByText("acme/alpha")).toBeInTheDocument();
    expect(screen.queryByText("acme/beta")).not.toBeInTheDocument();
  });

  it("shows a no-match empty state for a search with no results", async () => {
    const user = userEvent.setup();
    bootRegistry(repoSkills);
    renderReposPage();
    await screen.findByText("acme/alpha");

    await user.type(
      screen.getByRole("textbox", { name: "搜索仓库" }),
      "zzzzzzqqqq",
    );

    expect(
      await screen.findByText("未找到匹配“zzzzzzqqqq”的仓库"),
    ).toBeInTheDocument();
  });

  it("sorts repos by stars by default and by skills from the toolbar", async () => {
    const user = userEvent.setup();
    bootRegistry(repoSkills);
    renderReposPage();
    await screen.findByText("acme/alpha");

    // Default order: most stars first (beta has 50, alpha 10, git/x 1).
    const order = () =>
      screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(order()).toEqual(["acme/beta", "acme/alpha", "git/x"]);

    await user.click(screen.getByRole("button", { name: "按 Star 数" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "按 Skill 数" }),
    );
    expect(order()).toEqual(["acme/alpha", "acme/beta", "git/x"]);
  });

  it("pages the repo list without re-downloading the registry", async () => {
    const user = userEvent.setup();
    bootRegistry(makeSingleSkillRepos(50));
    renderReposPage();
    await screen.findByText("repo-00/skills");

    // Page 1 holds exactly 24 cards; repo-24 belongs to page 2.
    expect(screen.getByText("repo-23/skills")).toBeInTheDocument();
    expect(screen.queryByText("repo-24/skills")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "下一页" }));
    expect(await screen.findByText("repo-24/skills")).toBeInTheDocument();
    expect(harness.downloads).toBe(1);
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    harness.init();
    harness.fail(new Error("network error"));
    renderReposPage();

    expect(
      await screen.findByText("加载失败：network error"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    harness.pushAll(repoSkills);
    harness.complete();
    expect(await screen.findByText("acme/alpha")).toBeInTheDocument();
    expect(harness.downloads).toBe(2);
  });

  it("navigates to the repo detail page on card click", async () => {
    const user = userEvent.setup();
    bootRegistry(repoSkills);
    window.history.replaceState(null, "", "#/explore/repos");
    renderReposPage();
    await screen.findByText("acme/alpha");

    await user.click(
      screen.getByRole("button", { name: "查看 acme/alpha 中的 Skill" }),
    );

    // The repo detail page lists exactly that repo's skills.
    expect(
      await screen.findByRole("heading", { name: "acme/alpha" }),
    ).toBeInTheDocument();
    expect(screen.getByText("共 2 个 Skill")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看 a1 详情" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看 a2 详情" }),
    ).toBeInTheDocument();
  });
});
