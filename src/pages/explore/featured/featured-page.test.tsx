import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, within } from "@testing-library/react";

import { FEATURED_CATEGORIES } from "../../../data/featured-content";
import { renderWithRouter, screen, waitFor } from "../../../test/test-utils";
import { fetchSkillDetail } from "../../../lib/skill-detail-api";
import type { RegistryHarness } from "../../../test/registry-harness";
import type { Skill } from "../../../types/skill";
import { FeaturedPage } from "./featured-page";

/**
 * Embla needs real layout to compute snap points, which jsdom never has, so
 * the hero's carousel hook is replaced with a static fake: all slides render
 * while every scroll call becomes a no-op.
 */
const emblaApi = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  selectedScrollSnap: vi.fn(() => 0),
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  scrollTo: vi.fn(),
}));

vi.mock("embla-carousel-react", () => ({
  default: vi.fn(() => [vi.fn(), emblaApi]),
}));

/**
 * The registry client is replaced by a real-controller-driven harness, so
 * the featured tests exercise the exact RPC/event contract the worker
 * speaks (the query stays disabled until the worker reports `ready`).
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
  fetchSkillDetail: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

// 榜单测试只用三个分类：省略位跳过 design。
const [efficiency, , development, writing] = FEATURED_CATEGORIES;

/**
 * Build a registry fixture from the curated references: every skill gets
 * formulaic install numbers, so the hero leaderboards have a deterministic
 * ranking (the first curated skill always tops weekly and lifetime).
 */
function curatedIndex(): Skill[] {
  return FEATURED_CATEGORIES.flatMap((category, ci) =>
    category.skills.map((ref, si) => ({
      name: ref.name,
      repo: ref.repo,
      description: `${ref.name} description`,
      stars: 100 + si,
      downloads: 10_000 - ci * 10 - si,
      weeklyInstalls: 50 - si,
      path: `skills/${ref.name}`,
    })),
  );
}

/** The registry fixture minus `omit` — unresolvable curated references. */
function curatedIndexWithout(omit: Array<{ repo: string; name: string }>) {
  const dropped = new Set(omit.map((ref) => `${ref.repo}/${ref.name}`));
  return curatedIndex().filter((s) => !dropped.has(`${s.repo}/${s.name}`));
}

/** Load the harness with a complete registry before the page mounts. */
function bootRegistry(skills: Skill[]) {
  harness.reset();
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
      path: `skills/${name}/SKILL.md`,
    }),
  );
});

describe("FeaturedPage", () => {
  it("shows layout skeletons while the registry loads", async () => {
    harness.init(); // stream never completes → never ready
    const { container } = renderWithRouter(<FeaturedPage />);
    await act(async () => {});

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the skeleton while the registry is still streaming in", async () => {
    harness.init();
    const { container } = renderWithRouter(<FeaturedPage />);
    await act(async () => {});

    // Partial data arrives — rankings over an incomplete registry would be
    // wrong, so the page must not render any of it yet.
    harness.pushAll(curatedIndex().slice(0, 4));
    await act(async () => {});
    expect(
      container.querySelectorAll(".animate-pulse").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("region", { name: "精选推荐" }),
    ).not.toBeInTheDocument();

    // Completion (ready) unlocks the real content.
    harness.pushAll(curatedIndex().slice(4));
    harness.complete();
    expect(
      await screen.findByRole("region", { name: "精选推荐" }),
    ).toBeInTheDocument();
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    bootRegistry(curatedIndex());
    harness.setRpcError(new Error("network error"));
    renderWithRouter(<FeaturedPage />);

    expect(
      await screen.findByText("加载失败：network error"),
    ).toBeInTheDocument();

    harness.setRpcError(null);
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText(efficiency.title)).toBeInTheDocument();
  });

  it("renders the computed hero leaderboards and curated sections", async () => {
    bootRegistry(curatedIndex());
    renderWithRouter(<FeaturedPage />);

    // Hero: computed slides ranked from the registry fixture.
    const hero = await screen.findByRole("region", { name: "精选推荐" });
    expect(within(hero).getByText("Skill 周榜")).toBeInTheDocument();
    expect(within(hero).getByText("人气总榜")).toBeInTheDocument();
    // The first curated skill tops both the weekly and lifetime boards.
    expect(
      within(hero).getAllByText(efficiency.skills[0].name).length,
    ).toBeGreaterThanOrEqual(2);

    // Sections follow the curated order with one list per category.
    for (const category of FEATURED_CATEGORIES) {
      expect(
        screen.getByRole("region", { name: category.title }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }).length,
    ).toBe(FEATURED_CATEGORIES.reduce((n, c) => n + c.skills.length, 0));
  });

  it("skips curated references missing from the registry", async () => {
    const gone = development.skills.at(-1)!;
    const kept = development.skills[0];
    bootRegistry(curatedIndexWithout([gone]));
    renderWithRouter(<FeaturedPage />);

    await screen.findByText(development.title);
    // The stale reference vanishes, but the section itself survives as long
    // as any reference resolves.
    expect(screen.queryByText(gone.name)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `查看 ${kept.name} 详情` }),
    ).toBeInTheDocument();
  });

  it("hides a section when none of its references resolve", async () => {
    bootRegistry(curatedIndexWithout(writing.skills));
    renderWithRouter(<FeaturedPage />);

    expect(await screen.findByText(efficiency.title)).toBeInTheDocument();
    expect(screen.queryByText(writing.title)).not.toBeInTheDocument();
  });

  it("opens the detail panel when a row is clicked", async () => {
    const user = userEvent.setup();
    bootRegistry(curatedIndex());
    renderWithRouter(<FeaturedPage />);

    const first = efficiency.skills[0].name;
    await user.click(
      await screen.findByRole("button", { name: `查看 ${first} 详情` }),
    );

    expect(
      await screen.findByText(`Instructions for ${first}.`),
    ).toBeInTheDocument();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText(first)).toBeInTheDocument();
  });

  it("walks the whole curated list inside the panel with arrow keys", async () => {
    const user = userEvent.setup();
    const { fireEvent } = await import("@testing-library/react");
    bootRegistry(curatedIndex());
    renderWithRouter(<FeaturedPage />);

    const first = efficiency.skills[0].name;
    const second = efficiency.skills[1].name;
    await user.click(
      await screen.findByRole("button", { name: `查看 ${first} 详情` }),
    );
    expect(
      await screen.findByText(`Instructions for ${first}.`),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText(`Instructions for ${second}.`),
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
