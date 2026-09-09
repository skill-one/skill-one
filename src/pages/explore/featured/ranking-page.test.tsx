import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes } from "react-router";
import { act, within, fireEvent } from "@testing-library/react";

import { renderWithRouter, screen, waitFor } from "../../../test/test-utils";
import { fetchSkillDetail } from "../../../lib/skill-detail-api";
import type { RegistryHarness } from "../../../test/registry-harness";
import type { Skill } from "../../../types/skill";
import { RankingPage } from "./ranking-page";

/**
 * The registry client is replaced by a real-controller-driven harness, so the
 * page exercises the exact RPC/event contract the worker speaks (the query
 * stays disabled until the worker reports `ready`).
 */
vi.mock("../../../lib/registry/client", async () => {
  const { createRegistryHarness, createRegistryClientMock } = await import(
    "../../../test/registry-harness"
  );
  return createRegistryClientMock(createRegistryHarness());
});

const harness = (
  (await import("../../../lib/registry/client")) as unknown as {
    __harness: RegistryHarness;
  }
).__harness;

vi.mock("../../../lib/skill-detail-api", () => ({
  MIRROR: { repo: "skill-one/skills-sh-mirror", ref: "dist" },
  fetchSkillDetail: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

/**
 * A registry where every leaderboard ranks differently, so switching tabs is
 * observable: the trending list puts delta first, lifetime installs put beta
 * on top of the popular board.
 */
const INDEX: Skill[] = [
  { name: "alpha", repo: "acme/alpha", description: "Alpha skill.", stars: 900, downloads: 50_000, path: "skills/acme/alpha/alpha" },
  { name: "beta", repo: "acme/beta", description: "Beta skill.", stars: 800, downloads: 90_000, path: "skills/acme/beta/beta" },
  { name: "gamma", repo: "acme/gamma", description: "Gamma skill.", stars: 700, downloads: 1_000, path: "skills/acme/gamma/gamma" },
  { name: "delta", repo: "acme/delta", description: "Delta skill.", stars: 600, downloads: 5_000, path: "skills/acme/delta/delta" },
];

/** The trending list serves delta first, then alpha, beta, gamma. */
const TRENDING_IDS = ["acme/delta/delta", "acme/alpha/alpha", "acme/beta/beta", "acme/gamma/gamma"];

/** Mount the page as the ranking route would. */
function renderPage(rankingId = "trending") {
  return renderWithRouter(
    <Routes>
      <Route
        path="/explore/featured/ranking/:rankingId"
        element={<RankingPage />}
      />
    </Routes>,
    { route: `/explore/featured/ranking/${rankingId}` },
  );
}

/** Load the harness with a complete registry before the page mounts. */
function bootRegistry(
  skills: Skill[] = INDEX,
  trending: string[] | null = TRENDING_IDS,
) {
  harness.reset();
  harness.publishTrending(trending);
  harness.init();
  harness.pushAll(skills);
  harness.complete();
}

beforeEach(() => {
  harness.reset();
  mockFetchSkillDetail.mockReset();
  mockFetchSkillDetail.mockImplementation(
    async (_repo: string, name: string) => ({
      name,
      description: `Description of ${name}.`,
      instructions: `Instructions for ${name}.`,
      path: `skills/acme/x/${name}/SKILL.md`,
    }),
  );
});

describe("RankingPage", () => {
  it("shows row skeletons while the registry loads", async () => {
    harness.init(); // stream never completes → never ready
    const { container } = renderPage();
    await act(async () => {});

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("button", { name: /查看 .+ 详情/ })).not.toBeInTheDocument();
  });

  it("renders the leaderboard in upstream rank order with its metric", async () => {
    bootRegistry();
    renderPage("trending");

    const rows = await screen.findAllByRole("listitem");
    // Ranked by the trending id list, not by any registry metric: delta first.
    expect(rows.map((row) => within(row).getByRole("heading").textContent)).toEqual([
      "delta",
      "alpha",
      "beta",
      "gamma",
    ]);
    // Lifetime installs, preformatted by the worker; the first row is rank 1.
    expect(within(rows[0]).getByText("5K")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1")).toBeInTheDocument();
  });

  it("switches leaderboards through the tabs", async () => {
    const user = userEvent.setup();
    bootRegistry();
    renderPage("trending");

    expect(await screen.findByRole("heading", { name: "delta" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "人气总榜" }));

    // Lifetime installs put beta on top instead.
    await waitFor(() =>
      expect(screen.getByRole("list").firstChild).toHaveTextContent("beta"),
    );
  });

  it("reports how many skills ranked", async () => {
    bootRegistry();
    renderPage("trending");

    expect(await screen.findByText(/共 4 个 Skill/)).toBeInTheDocument();
  });

  it("opens the detail drawer and walks the leaderboard with arrow keys", async () => {
    const user = userEvent.setup();
    bootRegistry();
    renderPage("trending");

    await user.click(await screen.findByRole("button", { name: "查看 delta 详情" }));
    expect(await screen.findByText("Instructions for delta.")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText("Instructions for alpha."),
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("reports an empty leaderboard instead of failing", async () => {
    // No trending list was served: the board exists but has no entries.
    bootRegistry([
      { name: "solo", repo: "acme/solo", description: "", stars: 1, downloads: 0 },
    ], null);
    renderPage("trending");

    expect(await screen.findByText("暂无上榜 Skill")).toBeInTheDocument();
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    bootRegistry();
    harness.setRpcError(new Error("network error"));
    renderPage("trending");

    expect(await screen.findByText("加载失败：network error")).toBeInTheDocument();

    harness.setRpcError(null);
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("heading", { name: "delta" })).toBeInTheDocument();
  });

  it("reports an unknown leaderboard and offers the way back", async () => {
    bootRegistry();
    renderPage("nope");

    expect(await screen.findByText("榜单不存在：nope")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回精选" })).toHaveAttribute(
      "href",
      "/explore/featured",
    );
    // An unknown id is never asked of the worker.
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("goes back to the featured page via the header button", async () => {
    const user = userEvent.setup();
    bootRegistry();
    renderWithRouter(
      <Routes>
        <Route
          path="/explore/featured/ranking/:rankingId"
          element={<RankingPage />}
        />
        <Route path="/explore/featured" element={<div>featured page</div>} />
      </Routes>,
      { route: "/explore/featured/ranking/trending" },
    );

    await screen.findByRole("heading", { name: "趋势热榜" });
    await user.click(screen.getByRole("link", { name: "返回精选" }));

    expect(await screen.findByText("featured page")).toBeInTheDocument();
  });
});
