import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import {
  fetchInstalledSkills,
  fetchLocalSkillDetail,
} from "../../lib/local-skills";
import {
  resetMockProvenance,
  seedMockProvenance,
} from "../../lib/provenance";
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
  fetchLocalSkillDetail: vi.fn(),
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

/**
 * The same page under the installed list's own route for it: the reading the
 * installed list's repository cards open.
 */
function renderInstalledRepoPage(repo = REPO) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/my-skills/repo/*"
        element={<RepoPage origin="installed" />}
      />
    </Routes>,
    { route: `/my-skills/repo/${repo}` },
  );
}

/**
 * `names` of `repo` on disk, placed there by the ledger — the two facts the
 * installed list groups its cards by, and therefore the two facts the page a
 * card opens reads back. `disabled` names are parked, as the backend reports a
 * disabled skill.
 */
function installedOnDisk(names: string[], disabled: string[] = [], repo = REPO) {
  vi.mocked(fetchInstalledSkills).mockResolvedValue(
    names.map((name) => ({
      name,
      path: `skills/${name}`,
      enabled: !disabled.includes(name),
      description: `${name} on disk.`,
      installedAt: null,
    })),
  );
  seedMockProvenance(
    Object.fromEntries(names.map((name) => [name, { repo, slug: name }])),
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
    // An installed row carries no mirror path, so its panel reads the SKILL.md
    // off disk — the version the reader actually has.
    vi.mocked(fetchLocalSkillDetail).mockImplementation(async (name) => ({
      name,
      description: `Description of ${name}.`,
      instructions: `Instructions for ${name}.`,
      path: `skills/${name}/SKILL.md`,
    }));
  });

  afterEach(() => {
    // The provenance ledger is the browser's (localStorage): one test's
    // installs must not place skills in the next one's repositories.
    resetMockProvenance();
  });

  it("lists every skill of the repository, uncapped", async () => {
    bootRegistry(skillsOf(7));
    renderRepoPage();

    // All seven skills, one card each: the repository card's preview cap belongs
    // to the card, not to the page — opening the repository is how a reader sees
    // all of them.
    expect(await screen.findByRole("heading", { name: REPO })).toBeInTheDocument();
    expect(
      await screen.findAllByRole("button", { name: /^查看 skill-\d+ 详情$/ }),
    ).toHaveLength(7);
    expect(harness.downloads).toBe(1);
  });

  it("numbers the list, medalling the top three", async () => {
    bootRegistry(skillsOf(4));
    renderRepoPage();

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

  it("leads each row with the skill's classification glyph", async () => {
    bootRegistry([
      {
        ...skillsOf(1)[0],
        name: "redis",
        path: "skills/redis",
        profile: { domain: ["development"] },
      },
      // The dataset looked at this one and answered "none of these fit".
      {
        ...skillsOf(1)[0],
        name: "stray",
        path: "skills/stray",
        profile: { domain: ["other"] },
      },
      { ...skillsOf(1)[0], name: "orphan", path: "skills/orphan" },
    ]);
    renderRepoPage();

    // The classification, not the owner (the same for every row on this page),
    // leads the row.
    const redis = await screen.findByRole("button", {
      name: "查看 redis 详情",
    });
    expect(within(redis).getByText("💻")).toBeInTheDocument();

    // 其他 is an answer and wears the box; a skill nothing classified is a
    // question and wears the question mark. Both fill the same column, so the
    // names still line up either way.
    const stray = screen.getByRole("button", { name: "查看 stray 详情" });
    expect(within(stray).getByText("📦")).toBeInTheDocument();
    const orphan = screen.getByRole("button", { name: "查看 orphan 详情" });
    expect(within(orphan).getByText("❓")).toBeInTheDocument();
  });

  it("reveals more rows as the reader scrolls", async () => {
    // Twenty skills: more than one render chunk.
    bootRegistry(skillsOf(20));
    renderRepoPage();

    const rows = () =>
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情$/ });
    await screen.findByText("skill-0");

    // The first chunk mounts with the page; the rest waits behind the sentinel.
    expect(rows()).toHaveLength(12);
    expect(screen.queryByText("skill-12")).not.toBeInTheDocument();

    // Scrolling the sentinel into view extends the run until the repository is
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

  it("offers a way back to the store, and takes it", async () => {
    const user = userEvent.setup();
    bootRegistry(skillsOf(1));
    // The way out is the page's own head, so the list it hangs off is what the
    // page is mounted beside here.
    renderWithRouter(
      <Routes>
        <Route path="/repo/*" element={<RepoPage />} />
        <Route path="/explore" element={<div>store list</div>} />
      </Routes>,
      { route: `/repo/${REPO}` },
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: REPO }),
      ).toBeInTheDocument(),
    );
    // The href is where the control points for the reader the app cannot route
    // for itself: a modified click, and assistive tech reading the link.
    const back = screen.getByRole("link", { name: "返回" });
    expect(back).toHaveAttribute("href", "/explore");

    // A plain click goes through the app's own way out instead — a pop when
    // there is an entry behind this one (see `use-return.test.tsx`), and a
    // replacement when, as in this window, there is not.
    await user.click(back);
    expect(await screen.findByText("store list")).toBeInTheDocument();
  });

  /**
   * The installed list's reading of the same repository: what the reader has,
   * and the rest of the catalogue one deliberate step behind a control. The
   * store's reading above is unchanged by any of this.
   */
  describe("read from the installed list", () => {
    /** The rows on screen, in the order the page lists them. */
    const rows = () =>
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情$/ });

    it("opens on the installs, and keeps the rest behind one control", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      installedOnDisk(["skill-0", "skill-2"]);
      renderInstalledRepoPage();

      // The head counts what the reader has, not what the repository publishes.
      const head = await screen.findByRole("heading", { name: REPO });
      const figures = head.parentElement as HTMLElement;
      await waitFor(() => expect(figures).toHaveTextContent("2 个已安装 skill"));
      expect(figures).toHaveTextContent(formatCount(STARS));

      // Only the installs are listed — the other two are not on this machine.
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(
        screen.getByRole("button", { name: "查看 skill-0 详情" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "查看 skill-1 详情" })).toBeNull();

      // The repository's other skills are named by the control at the foot,
      // which swaps the reading in place rather than leaving the repository.
      await user.click(
        screen.getByRole("button", { name: "查看该仓库全部 4 个 skill" }),
      );
      expect(rows()).toHaveLength(4);
      expect(
        screen.getByRole("button", { name: "查看 skill-1 详情" }),
      ).toBeInTheDocument();
      expect(figures).toHaveTextContent("4 个 skill");
      expect(figures).not.toHaveTextContent("已安装");

      // And back, to the reader's own installs.
      await user.click(screen.getByRole("button", { name: "只看已安装" }));
      expect(rows()).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "查看 skill-1 详情" })).toBeNull();
      expect(figures).toHaveTextContent("2 个已安装 skill");
    });

    it("gives each install the installed list's own chrome", async () => {
      bootRegistry(skillsOf(2));
      installedOnDisk(["skill-0", "skill-1"], ["skill-1"]);
      renderInstalledRepoPage();

      // The enable switch is the installed list's row action, drawn always: a
      // reader scanning for a disabled skill must see it without pointing.
      expect(
        await screen.findByRole("switch", { name: "关闭 skill-0" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("switch", { name: "开启 skill-1" }),
      ).toBeInTheDocument();

      // The disabled row is dimmed, exactly as it is on the list it came from.
      expect(
        screen.getByRole("button", { name: "查看 skill-1 详情" }),
      ).toHaveClass("opacity-60");
      expect(
        screen.getByRole("button", { name: "查看 skill-0 详情" }),
      ).not.toHaveClass("opacity-60");
    });

    it("walks only the installs in the detail panel", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      installedOnDisk(["skill-0", "skill-2"]);
      renderInstalledRepoPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 skill-0 详情" }),
      );
      expect(
        await screen.findByText("Instructions for skill-0."),
      ).toBeInTheDocument();

      // Next walks the installs, not the catalogue: skill-2, then the end.
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(
        await screen.findByText("Instructions for skill-2."),
      ).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText("Instructions for skill-2.")).toBeInTheDocument();
    });

    it("lists the installs even when the index does not carry the repository", async () => {
      // The repository fell out of the published index. What is on disk is a
      // fact of its own, so the page still answers the card that opened it —
      // and offers nothing else, there being no catalogue here to offer.
      bootRegistry(skillsOf(2, "other/repo"));
      installedOnDisk(["skill-0"]);
      renderInstalledRepoPage();

      expect(
        await screen.findByRole("button", { name: "查看 skill-0 详情" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(`索引中没有仓库 ${REPO}`)).toBeNull();
      expect(
        screen.queryByRole("button", { name: /^查看该仓库全部/ }),
      ).toBeNull();
    });

    it("leads back to the installed list, not to the store", async () => {
      bootRegistry(skillsOf(2));
      installedOnDisk(["skill-0"]);
      renderWithRouter(
        <Routes>
          <Route
            path="/my-skills/repo/*"
            element={<RepoPage origin="installed" />}
          />
          <Route path="/my-skills" element={<div>installed list</div>} />
        </Routes>,
        { route: `/my-skills/repo/${REPO}` },
      );

      // The two readings share one component but not one list: the page a card
      // opens goes back to where the card was, not to the store's page for the
      // same repository.
      expect(
        await screen.findByRole("link", { name: "返回" }),
      ).toHaveAttribute("href", "/my-skills");
    });

    it("offers no second reading when the repository has nothing left to install", async () => {
      bootRegistry(skillsOf(3));
      installedOnDisk(["skill-0", "skill-1", "skill-2"]);
      renderInstalledRepoPage();

      expect(await screen.findByText("skill-0")).toBeInTheDocument();
      expect(rows()).toHaveLength(3);
      // The two readings would be the same list, so the control stands down.
      expect(
        screen.queryByRole("button", { name: /^查看该仓库全部/ }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "只看已安装" }),
      ).toBeNull();
    });
  });
});
