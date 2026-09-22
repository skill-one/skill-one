import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { fetchInstalledSkills } from "../../lib/local-skills";
import type { RegistryHarness } from "../../test/registry-harness";
import type { Skill } from "../../types/skill";
import { renderWithRouter } from "../../test/test-utils";
import { CategoryPage } from "./category-page";

/**
 * The page reads the store's category grouping through the same worker contract
 * the explore list does, so the tests drive the real controller through the
 * harness rather than stubbing the answer shape.
 */
vi.mock("../../lib/registry/client", async () => {
  const { createRegistryHarness, createRegistryClientMock } =
    await import("../../test/registry-harness");
  return createRegistryClientMock(createRegistryHarness());
});

const harness = (
  (await import("../../lib/registry/client")) as unknown as {
    __harness: RegistryHarness;
  }
).__harness;

vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

vi.mock("../../lib/local-skills", () => ({
  fetchInstalledSkills: vi.fn(),
  installSkillFromSource: vi.fn(),
}));

/** A domain key and the label the UI shows for it. */
const DOMAIN = "office-productivity";
const LABEL = "办公效率";

/** `count` skills classified under `domain`, most installed first — one more
 *  than a card's cap, so a test can tell "all of them" from "a bounded list". */
function skillsOf(count: number, domain = DOMAIN): Skill[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    repo: "anthropics/skills",
    description: "A utility.",
    stars: 100,
    downloads: count - i,
    path: `skills/skill-${i}`,
    profile: { domain: [domain] },
  }));
}

/** The page under the route the app mounts it at. */
function renderCategoryPage(domain = DOMAIN) {
  return renderWithRouter(
    <Routes>
      <Route path="/explore/category/:domain" element={<CategoryPage />} />
    </Routes>,
    { route: `/explore/category/${domain}` },
  );
}

/** One registry download, complete, holding `skills`. */
function bootRegistry(skills: Skill[]) {
  harness.reset();
  harness.init();
  harness.pushAll(skills);
  harness.complete();
}

describe("CategoryPage", () => {
  beforeEach(() => {
    harness.reset();
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
    vi.mocked(fetchSkillDetail).mockImplementation(async (_repo, id) => ({
      name: id,
      description: `Description of ${id}.`,
      instructions: `Instructions for ${id}.`,
      path: `skills/${id}/SKILL.md`,
    }));
  });

  it("lists every skill of the category, uncapped", async () => {
    bootRegistry(skillsOf(7));
    renderCategoryPage();

    // Seven cards: the category card's cap belongs to the card, not to the
    // page — opening the category is how a reader sees all of them.
    expect(
      await screen.findByRole("heading", { name: LABEL }),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByRole("button", { name: /^查看 skill-\d+ 详情$/ }),
    ).toHaveLength(7);
    expect(harness.downloads).toBe(1);
  });

  it("numbers the list, medalling the top three", async () => {
    bootRegistry(skillsOf(4));
    renderCategoryPage();

    // The list's one addition: where each skill stands. The first three wear
    // the podium ink; the fourth is merely enumerated.
    const first = await screen.findByRole("button", {
      name: "查看 skill-0 详情",
    });
    expect(within(first).getByText("1").className).toContain("text-amber-500");
    const fourth = screen.getByRole("button", { name: "查看 skill-3 详情" });
    expect(within(fourth).getByText("4").className).not.toContain(
      "text-amber-500",
    );
  });

  it("reveals more rows as the reader scrolls", async () => {
    // Twenty skills: more than one render chunk.
    bootRegistry(skillsOf(20));
    renderCategoryPage();

    const rows = () =>
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情$/ });
    await screen.findByText("skill-0");

    // The first chunk mounts with the page; the rest waits behind the sentinel.
    expect(rows()).toHaveLength(12);
    expect(screen.queryByText("skill-12")).not.toBeInTheDocument();

    // Scrolling the sentinel into view extends the run until the category is
    // fully mounted, and the sentinel is gone.
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    act(() => lastObserver().trigger(true));
    await waitFor(() => expect(rows()).toHaveLength(20));
    expect(screen.getByText("skill-19")).toBeInTheDocument();
  });

  it("names the category with its glyph and count", async () => {
    bootRegistry([...skillsOf(3), ...skillsOf(1, "development")]);
    renderCategoryPage();

    const head = await screen.findByRole("heading", { name: LABEL });
    const figures = head.parentElement as HTMLElement;
    expect(figures).toHaveTextContent("3 个 skill");
  });

  it("holds a skeleton until the stream reaches the category", async () => {
    harness.init();
    const { container } = renderCategoryPage();
    await act(async () => {});

    // Nothing has arrived: card-shaped placeholders stand in, and the page
    // already says which category it is showing.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(8);

    // Another category's skills land first — this one is still not reached, so
    // the skeleton stays.
    harness.pushAll(skillsOf(2, "development"));
    await act(async () => {});
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();

    // Its own skills arrive and the placeholders give way.
    harness.pushAll(skillsOf(2));
    expect(
      await screen.findByRole("button", { name: "查看 skill-0 详情" }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("says so when the completed index does not carry the category", async () => {
    bootRegistry(skillsOf(2, "development"));
    renderCategoryPage();

    expect(
      await screen.findByText(`索引中没有分类 ${LABEL}`),
    ).toBeInTheDocument();
  });

  it("walks only the category's own skills in the detail panel", async () => {
    const user = userEvent.setup();
    bootRegistry([...skillsOf(3), ...skillsOf(2, "development")]);
    renderCategoryPage();

    await user.click(
      await screen.findByRole("button", { name: "查看 skill-0 详情" }),
    );
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();

    // Next walks the category, not the store: three skills, then the end of the
    // list — never another category's skill.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText("Instructions for skill-1."),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText("Instructions for skill-2."),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Instructions for skill-2.")).toBeInTheDocument();
  });

  it("offers a way back to the store, and takes it", async () => {
    const user = userEvent.setup();
    bootRegistry(skillsOf(1));
    renderWithRouter(
      <Routes>
        <Route path="/explore/category/:domain" element={<CategoryPage />} />
        <Route path="/explore" element={<div>store list</div>} />
      </Routes>,
      { route: `/explore/category/${DOMAIN}` },
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: LABEL })).toBeInTheDocument(),
    );
    const back = screen.getByRole("link", { name: "返回探索" });
    expect(back).toHaveAttribute("href", "/explore");

    await user.click(back);
    expect(await screen.findByText("store list")).toBeInTheDocument();
  });
});
