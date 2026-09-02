import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter, Route, Routes } from "react-router";

import type { Skill } from "../../../types/skill";
import type { RegistryHarness } from "../../../test/registry-harness";
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
];

function bootRegistry(skills: Skill[]) {
  harness.reset();
  harness.init();
  harness.pushAll(skills);
  harness.complete();
}

let queryClient: QueryClient;

function renderDetailPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/explore/repos" element={<ReposPage />} />
          <Route
            path="/explore/repos/:owner/:repo"
            element={<RepoDetailPage />}
          />
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
});

describe("RepoDetailPage", () => {
  it("lists only the repo's skills with the star count and total", async () => {
    bootRegistry(repoSkills);
    window.history.replaceState(null, "", "#/explore/repos/acme/alpha");
    renderDetailPage();

    expect(
      await screen.findByRole("heading", { name: "acme/alpha" }),
    ).toBeInTheDocument();
    expect(screen.getByText("共 2 个 Skill")).toBeInTheDocument();
    // Only acme/alpha's skills render; beta's stay out of the exact filter.
    expect(screen.getByText("a1")).toBeInTheDocument();
    expect(screen.getByText("a2")).toBeInTheDocument();
    expect(screen.queryByText("b1")).not.toBeInTheDocument();
  });

  it("goes back to the repos list via the back link", async () => {
    const user = userEvent.setup();
    bootRegistry(repoSkills);
    window.history.replaceState(null, "", "#/explore/repos/acme/alpha");
    renderDetailPage();
    expect(await screen.findByText("a1")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回仓库列表" }));

    expect(await screen.findByText("acme/beta")).toBeInTheDocument();
  });

  it("shows the empty state for an unknown repo", async () => {
    bootRegistry(repoSkills);
    window.history.replaceState(null, "", "#/explore/repos/acme/ghost");
    renderDetailPage();

    expect(
      await screen.findByText("仓库 acme/ghost 下暂无 Skill"),
    ).toBeInTheDocument();
  });
});
