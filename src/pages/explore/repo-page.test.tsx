import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { fetchInstalledSkills } from "../../lib/local-skills";
import { formatCount } from "../../lib/utils";
import type { RegistryHarness } from "../../test/registry-harness";
import type { Skill } from "../../types/skill";
import { renderWithRouter } from "../../test/test-utils";
import { RepoPage } from "./repo-page";

/**
 * The page reads the store's repository grouping through the same worker
 * contract the explore list does, so the tests drive the real controller
 * through the harness rather than stubbing the answer shape.
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

vi.mock("../../lib/open-external", () => ({ openExternal: vi.fn() }));

const REPO = "anthropics/skills";
const STARS = 169_600;

/** `count` skills in `repo`, most installed first — one more than a card's cap,
 *  so a test can tell "all of them" from "a bounded list". */
function skillsOf(count: number, repo = REPO): Skill[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    repo,
    description: "A utility.",
    stars: STARS,
    downloads: count - i,
    path: `skills/skill-${i}`,
  }));
}

/** The page under the route the app mounts it at, `owner/repo` and all. */
function renderRepoPage(repo = REPO) {
  return renderWithRouter(
    <Routes>
      <Route path="/repo/*" element={<RepoPage />} />
    </Routes>,
    { route: `/repo/${repo}` },
  );
}

/** One registry download, complete, holding `skils`. */
function bootRegistry(skills: Skill[]) {
  harness.reset();
  harness.init();
  harness.pushAll(skills);
  harness.complete();
}

describe("RepoPage", () => {
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

  it("lists every skill of the repository, uncapped", async () => {
    bootRegistry(skillsOf(7));
    renderRepoPage();

    // Seven cards: the repository card's cap belongs to the card, not to the
    // page — opening the repository is how a reader sees all of them.
    expect(await screen.findByRole("heading", { name: REPO })).toBeInTheDocument();
    expect(
      await screen.findAllByRole("button", { name: /^查看 skill-\d+ 详情$/ }),
    ).toHaveLength(7);
    expect(harness.downloads).toBe(1);
  });

  it("names the repository with the figures the grouping carried", async () => {
    bootRegistry([
      ...skillsOf(3),
      ...skillsOf(1, "other/repo"),
    ]);
    renderRepoPage();

    const head = await screen.findByRole("heading", { name: REPO });
    expect(head).toBeInTheDocument();
    const figures = head.parentElement as HTMLElement;
    expect(figures).toHaveTextContent(formatCount(STARS));
    expect(figures).toHaveTextContent("3 个 skill");

    const user = userEvent.setup();
    const { openExternal } = await import("../../lib/open-external");
    await user.click(screen.getByRole("button", { name: "在 GitHub 打开" }));
    expect(openExternal).toHaveBeenCalledWith(`https://github.com/${REPO}`);
  });

  it("holds a skeleton until the stream reaches the repository", async () => {
    harness.init();
    const { container } = renderRepoPage();
    await act(async () => {});

    // Nothing has arrived: card-shaped placeholders stand in, and the page
    // already says which repository it is showing.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(8);

    // Another repository's skills land first — this one is still not reached,
    // so the skeleton stays.
    harness.pushAll(skillsOf(2, "other/repo"));
    await act(async () => {});
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();

    // Its own skills arrive and the placeholders give way.
    harness.pushAll(skillsOf(2));
    expect(
      await screen.findByRole("button", { name: "查看 skill-0 详情" }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("says so when the completed index does not carry the repository", async () => {
    bootRegistry(skillsOf(2, "other/repo"));
    renderRepoPage();

    expect(
      await screen.findByText(`索引中没有仓库 ${REPO}`),
    ).toBeInTheDocument();
  });

  it("walks only the repository's own skills in the detail panel", async () => {
    const user = userEvent.setup();
    bootRegistry([...skillsOf(3), ...skillsOf(2, "other/repo")]);
    renderRepoPage();

    await user.click(
      await screen.findByRole("button", { name: "查看 skill-0 详情" }),
    );
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();

    // Next walks the repository, not the store: three skills, then the end of
    // the list — never another repository's skill.
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

  it("offers a way back to the store", async () => {
    bootRegistry(skillsOf(1));
    renderRepoPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: REPO }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "返回探索" })).toHaveAttribute(
      "href",
      "/explore",
    );
  });
});
