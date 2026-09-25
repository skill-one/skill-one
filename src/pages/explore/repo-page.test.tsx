import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import {
  fetchInstalledSkills,
  fetchLocalSkillDetail,
  removeInstalledSkills,
  setManySkillsEnabled,
} from "../../lib/local-skills";
import { resetMockProvenance, seedMockProvenance } from "../../lib/provenance";
import { resetListView, setQuery } from "../../lib/list-view";
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
  setManySkillsEnabled: vi.fn(),
  removeInstalledSkills: vi.fn(),
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
      <Route path="/my-skills" element={<div>installed list</div>} />
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
function installedOnDisk(
  names: string[],
  disabled: string[] = [],
  repo = REPO,
) {
  vi.mocked(fetchInstalledSkills).mockResolvedValue(
    names.map((name) => ({
      name,
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
      description: `Description of ${id}.`,
      instructions: `Instructions for ${id}.`,
      path: `skills/${id}/SKILL.md`,
    }));
    // An installed row carries no mirror path, so its panel reads the SKILL.md
    // off disk — the version the reader actually has.
    vi.mocked(fetchLocalSkillDetail).mockImplementation(async (name) => ({
      description: `Description of ${name}.`,
      instructions: `Instructions for ${name}.`,
      path: `skills/${name}/SKILL.md`,
    }));
  });

  afterEach(() => {
    // The provenance ledger is the browser's (localStorage): one test's
    // installs must not place skills in the next one's repositories.
    resetMockProvenance();
    // The shared search box is module-level state: one case's query must not
    // narrow the next case's repository page.
    resetListView();
  });

  it("lists every skill of the repository, uncapped", async () => {
    bootRegistry(skillsOf(7));
    renderRepoPage();

    // All seven skills, one card each: the repository card's preview cap belongs
    // to the card, not to the page — opening the repository is how a reader sees
    // all of them.
    expect(
      await screen.findByRole("heading", { name: REPO }),
    ).toBeInTheDocument();
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
    expect(redis.querySelector("svg.lucide-code")).toBeInTheDocument();

    // 其他 is an answer and wears the mixed shapes; a skill nothing classified
    // is a question and wears the help icon. Both fill the same column, so the
    // names still line up either way.
    const stray = screen.getByRole("button", { name: "查看 stray 详情" });
    expect(stray.querySelector("svg.lucide-shapes")).toBeInTheDocument();
    const orphan = screen.getByRole("button", { name: "查看 orphan 详情" });
    expect(orphan.querySelector("svg.lucide-circle-help")).toBeInTheDocument();
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
    bootRegistry([...skillsOf(3), ...skillsOf(1, "other/repo")]);
    renderRepoPage();

    const head = await screen.findByRole("heading", { name: REPO });
    expect(head).toBeInTheDocument();
    const figures = head.parentElement?.parentElement as HTMLElement;
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
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      8,
    );

    // Another repository's skills land first — this one is still not reached,
    // so the skeleton stays.
    harness.pushAll(skillsOf(2, "other/repo"));
    await act(async () => {});
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();

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
      expect(screen.getByRole("heading", { name: REPO })).toBeInTheDocument(),
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
   * and the rest of the catalogue one deliberate step below a fold. The store's
   * reading above is unchanged by any of this.
   */
  describe("read from the installed list", () => {
    /** The rows on screen, in the order the page lists them. */
    const rows = () =>
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情$/ });

    /** Each row's skill name, in document order. */
    const rowNames = () =>
      rows().map((row) =>
        row
          .getAttribute("aria-label")
          ?.replace("查看 ", "")
          .replace(" 详情", ""),
      );

    it("opens on the installs, with the rest folded beneath a dividing rule", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      installedOnDisk(["skill-0", "skill-2"]);
      renderInstalledRepoPage();

      // The head counts what the reader has, not what the repository publishes.
      const head = await screen.findByRole("heading", { name: REPO });
      const figures = head.parentElement?.parentElement as HTMLElement;
      await waitFor(() =>
        expect(figures).toHaveTextContent("2 个已安装 skill"),
      );
      expect(figures).toHaveTextContent(formatCount(STARS));

      // Only the installs are listed — the helper's records carry no birth
      // time, so they settle name-ordered — and the other two are not on this
      // machine and wait below the fold.
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(rowNames()).toEqual(["skill-0", "skill-2"]);
      expect(
        screen.queryByRole("button", { name: "查看 skill-1 详情" }),
      ).toBeNull();

      // The fold is a rule between the two readings rather than a button under
      // them; it names exactly what unfolding adds.
      const fold = screen.getByRole("button", {
        name: "查看同仓库其他 2 个未安装 skill",
      });
      expect(fold).toHaveAttribute("aria-expanded", "false");

      // One press unfolds the catalogue *beneath* the installs: they stay first
      // in the same rows, and the catalogue continues after the rule, numbering
      // on from the installs rather than starting over.
      await user.click(fold);
      await waitFor(() => expect(rows()).toHaveLength(4));
      expect(rowNames()).toEqual(["skill-0", "skill-2", "skill-1", "skill-3"]);
      const firstRest = screen
        .getByRole("button", { name: "查看 skill-1 详情" })
        .closest("li") as HTMLElement;
      // The catalogue numbers on from the installs (two rows) rather than
      // starting over: skill-1 is third overall. The ordinal slot is scoped
      // explicitly because this row's install figure happens to read "3" too.
      expect(
        within(firstRest).getByText("3", { selector: "span.w-6" }),
      ).toBeInTheDocument();

      // The two readings keep their own chrome: switches on the installs, the
      // store's install buttons on the folded-out rows.
      expect(
        screen.getByRole("switch", { name: "关闭 skill-0" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("switch", { name: "关闭 skill-2" }),
      ).toBeInTheDocument();
      expect(within(firstRest).queryByRole("switch")).toBeNull();
      expect(
        within(firstRest).getByRole("button", { name: "安装" }),
      ).toBeInTheDocument();

      // The head never swaps readings, so its count stays the count on disk.
      expect(figures).toHaveTextContent("2 个已安装 skill");
      expect(fold).toHaveAttribute("aria-expanded", "true");
      expect(fold).toHaveTextContent("收起未安装的 2 个 skill");

      // A second press folds the catalogue away; the installs are exactly as
      // they were — same two rows, same order, same head.
      await user.click(fold);
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(rowNames()).toEqual(["skill-0", "skill-2"]);
      expect(
        screen.queryByRole("button", { name: "查看 skill-1 详情" }),
      ).toBeNull();
      expect(fold).toHaveAttribute("aria-expanded", "false");
      expect(figures).toHaveTextContent("2 个已安装 skill");
    });

    it("lists the installs newest-first, the order the card showed them in", async () => {
      bootRegistry(skillsOf(4));
      // Installs the registry's own ranking would have ordered skill-0,
      // skill-2, skill-3 (downloads) — but the card on the installed list
      // reads them by install time, so the page does too, and an install the
      // index no longer publishes (skill-9) joins the same ordering rather
      // than trailing it.
      vi.mocked(fetchInstalledSkills).mockResolvedValue([
        {
          name: "skill-0",
          enabled: true,
          description: "skill-0 on disk.",
          installedAt: 1_000,
        },
        {
          name: "skill-2",
          enabled: true,
          description: "skill-2 on disk.",
          installedAt: 3_000,
        },
        {
          name: "skill-3",
          enabled: true,
          description: "skill-3 on disk.",
          installedAt: null,
        },
        {
          name: "skill-9",
          enabled: true,
          description: "skill-9 on disk.",
          installedAt: 2_000,
        },
      ]);
      seedMockProvenance(
        Object.fromEntries(
          ["skill-0", "skill-2", "skill-3", "skill-9"].map((name) => [
            name,
            { repo: REPO, slug: name },
          ]),
        ),
      );
      renderInstalledRepoPage();

      // Install time desc: skill-2 newest, then skill-9, then skill-0; the
      // stampless skill-3 trails, exactly as it would trail on the card.
      await waitFor(() => expect(rows()).toHaveLength(4));
      expect(rowNames()).toEqual(["skill-2", "skill-9", "skill-0", "skill-3"]);
    });

    it("still offers the fold when nothing is installed yet", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(3));
      // Nothing on disk at all: rather than dead-ending in an empty message,
      // the fold is the page's content and one press opens the repository.
      renderInstalledRepoPage();

      const fold = await screen.findByRole("button", {
        name: "查看同仓库其他 3 个未安装 skill",
      });
      expect(screen.queryByText("该仓库没有已安装的 skill")).toBeNull();
      await user.click(fold);
      expect(
        await screen.findAllByRole("button", { name: /^查看 skill-\d+ 详情$/ }),
      ).toHaveLength(3);
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
      // No catalogue, no fold: the rule only stands where something unfolds.
      expect(
        screen.queryByRole("button", { name: /查看同仓库其他/ }),
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
      expect(await screen.findByRole("link", { name: "返回" })).toHaveAttribute(
        "href",
        "/my-skills",
      );
    });

    it("offers no fold when the repository has nothing left to install", async () => {
      bootRegistry(skillsOf(3));
      installedOnDisk(["skill-0", "skill-1", "skill-2"]);
      renderInstalledRepoPage();

      expect(await screen.findByText("skill-0")).toBeInTheDocument();
      expect(rows()).toHaveLength(3);
      // Everything published is on disk, so the rule would fold nothing.
      expect(
        screen.queryByRole("button", { name: /查看同仓库其他/ }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: /收起未安装/ })).toBeNull();
    });

    it("carries the card bar's group switch in the head, half-on like the card", async () => {
      bootRegistry(skillsOf(4));
      installedOnDisk(["skill-0", "skill-2"], ["skill-2"]);
      renderInstalledRepoPage();

      // The same one-shot switch the repository card carries, named for this
      // repository — and reading the same half state: one install off reads as
      // the half-filled track, not as simply off.
      const group = await screen.findByRole("switch", {
        name: "全部开启（anthropics/skills）",
      });
      expect(group).toHaveAttribute("aria-checked", "false");
      expect(group).toHaveClass("data-unchecked:bg-primary/40!");
    });

    it("flips every install of the repository from the head switch", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      const names = ["skill-0", "skill-2"];
      // A backend that answers from mutable state, so the refetch the switch's
      // own invalidation triggers reports the write the mock just made.
      const disabled = new Set<string>();
      vi.mocked(fetchInstalledSkills).mockImplementation(async () =>
        names.map((name) => ({
          name,
          enabled: !disabled.has(name),
          description: `${name} on disk.`,
          installedAt: null,
        })),
      );
      seedMockProvenance(
        Object.fromEntries(
          names.map((name) => [name, { repo: REPO, slug: name }]),
        ),
      );
      vi.mocked(setManySkillsEnabled).mockImplementation(
        async (targets: string[], enabled: boolean) => {
          targets.forEach((name) =>
            enabled ? disabled.delete(name) : disabled.add(name),
          );
        },
      );
      renderInstalledRepoPage();

      await user.click(
        await screen.findByRole("switch", {
          name: "全部关闭（anthropics/skills）",
        }),
      );

      // One press names both installs to the batch write, and the refetched
      // rows agree: both rows dim behind a switch that now reads all off.
      expect(vi.mocked(setManySkillsEnabled)).toHaveBeenCalledWith(
        names,
        false,
      );
      expect(
        await screen.findByRole("switch", {
          name: "全部开启（anthropics/skills）",
        }),
      ).toHaveAttribute("aria-checked", "false");
      expect(
        screen.getByRole("button", { name: "查看 skill-0 详情" }),
      ).toHaveClass("opacity-60");
      expect(
        screen.getByRole("button", { name: "查看 skill-2 详情" }),
      ).toHaveClass("opacity-60");
    });

    it("rides the batch removal beside the group switch, in the installed head only", async () => {
      bootRegistry(skillsOf(2));
      installedOnDisk(["skill-0"]);
      const installed = renderInstalledRepoPage();

      // The head's two batch controls sit together: the switch, then the
      // removal mark — the pair of one-shot actions this page's granularity
      // offers. (The one install is enabled, so the switch reads all on.)
      const group = await screen.findByRole("switch", {
        name: "全部关闭（anthropics/skills）",
      });
      const remove = screen.getByRole("button", {
        name: "移除全部（anthropics/skills）",
      });
      expect(
        group.compareDocumentPosition(remove) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      installed.unmount();

      // The store's reading has nothing installed to remove, and its head
      // carries the nothing it should.
      renderWithRouter(
        <Routes>
          <Route path="/repo/*" element={<RepoPage />} />
        </Routes>,
        { route: `/repo/${REPO}` },
      );
      await screen.findByRole("heading", { name: REPO });
      expect(
        screen.queryByRole("button", { name: /移除全部/ }),
      ).toBeNull();
    });

    it("removes every install only after the dialog confirms it", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      const names = ["skill-0", "skill-2"];
      // A backend that answers from mutable state, so the refetch the
      // removal's own invalidation triggers reports the deletion the mock
      // just made.
      const onDisk = new Set(names);
      vi.mocked(fetchInstalledSkills).mockImplementation(async () =>
        [...onDisk].map((name) => ({
          name,
          enabled: true,
          description: `${name} on disk.`,
          installedAt: null,
        })),
      );
      seedMockProvenance(
        Object.fromEntries(
          names.map((name) => [name, { repo: REPO, slug: name }]),
        ),
      );
      vi.mocked(removeInstalledSkills).mockImplementation(
        async (targets: readonly string[]) => {
          targets.forEach((name) => onDisk.delete(name));
        },
      );
      renderInstalledRepoPage();
      await user.click(
        await screen.findByRole("button", {
          name: "移除全部（anthropics/skills）",
        }),
      );

      // The press opens the ask, not the act: the dialog names what will go —
      // count and names. (A modal dialog hides the page from queries, so the
      // rows behind it are asserted once it is gone.)
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(/将从本机卸载 anthropics\/skills 的 2 个 skill/),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("skill-0")).toBeInTheDocument();
      expect(within(dialog).getByText("skill-2")).toBeInTheDocument();

      // Backing out changes nothing.
      await user.click(within(dialog).getByRole("button", { name: "取消" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(vi.mocked(removeInstalledSkills)).not.toHaveBeenCalled();
      expect(rows()).toHaveLength(2);

      // The second press acts: one call names both installs to the batch
      // write, the refetched page holds no rows — and the page, its subject
      // gone from disk, goes back to the list it came from.
      await user.click(
        screen.getByRole("button", { name: "移除全部（anthropics/skills）" }),
      );
      await user.click(
        await within(await screen.findByRole("dialog")).findByRole("button", {
          name: "移除",
        }),
      );
      expect(vi.mocked(removeInstalledSkills)).toHaveBeenCalledWith(names);
      await waitFor(() =>
        expect(screen.getByText("installed list")).toBeInTheDocument(),
      );
      expect(screen.queryByRole("heading", { name: REPO })).toBeNull();
    });

    it("matches the detail panel's chrome to the half the open row stands in", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      installedOnDisk(["skill-0"]);
      renderInstalledRepoPage();

      // An installed row opens the installed panel: the enable switch.
      await user.click(
        await screen.findByRole("button", { name: "查看 skill-0 详情" }),
      );
      expect(
        await within(await screen.findByRole("dialog")).findByRole("switch", {
          name: "关闭 skill-0",
        }),
      ).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );

      // A folded-out row opens the store's panel instead: the install CTA, and
      // no switch.
      await user.click(
        screen.getByRole("button", {
          name: "查看同仓库其他 3 个未安装 skill",
        }),
      );
      await user.click(
        await screen.findByRole("button", { name: "查看 skill-1 详情" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).queryByRole("switch")).toBeNull();
      expect(
        within(dialog).getByRole("button", { name: "安装" }),
      ).toBeInTheDocument();
    });
  });

  /**
   * A search that opened the repository card is still live on the page it
   * opens: the matches read first, exactly the rows the card showed, and the
   * repository's other skills wait behind a dividing rule of the same kind.
   */
  describe("opened from a search", () => {
    /** Each row's skill name, in document order. */
    const rowNames = () =>
      screen
        .getAllByRole("button", { name: /^查看 skill-\d+ 详情$/ })
        .map((row) =>
          row
            .getAttribute("aria-label")
            ?.replace("查看 ", "")
            .replace(" 详情", ""),
        );

    it("opens on the matches and folds the store's other skills beneath a rule", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      // The query is set before the page mounts, exactly the state the shared
      // search box is in when a card's door walks through to this page.
      setQuery("skill-1");
      renderRepoPage();

      // Only the match is listed at first, in its own row with the matched
      // term highlighted.
      await waitFor(() => expect(rowNames()).toEqual(["skill-1"]));
      const match = screen
        .getByRole("button", {
          name: "查看 skill-1 详情",
        })
        .closest("li") as HTMLElement;
      // The matched term is highlighted in the row's name.
      expect(match.querySelector("mark")).not.toBeNull();

      // The fold names exactly what unfolding adds.
      const fold = screen.getByRole("button", {
        name: "查看同仓库其他 3 个 skill",
      });
      expect(fold).toHaveAttribute("aria-expanded", "false");
      expect(fold).toHaveAttribute("aria-controls", "repo-other-skills");

      // One press continues the repository beneath the match, in its own order,
      // numbering on from the match rather than starting over.
      await user.click(fold);
      await waitFor(() => expect(rowNames()).toHaveLength(4));
      expect(rowNames()).toEqual(["skill-1", "skill-0", "skill-2", "skill-3"]);
      const firstOther = screen
        .getByRole("button", { name: "查看 skill-0 详情" })
        .closest("li") as HTMLElement;
      expect(
        within(firstOther).getByText("2", { selector: "span.w-6" }),
      ).toBeInTheDocument();
      expect(fold).toHaveTextContent("收起其他 3 个 skill");

      // A second press folds the others away; the match is exactly as it was.
      await user.click(fold);
      await waitFor(() => expect(rowNames()).toEqual(["skill-1"]));
    });

    it("folds the search's other installs, then the uninstalled catalogue one level deeper", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      installedOnDisk(["skill-0", "skill-1", "skill-2"]);
      setQuery("skill-2");
      renderInstalledRepoPage();

      // The one matching install opens first, in the installed reading's own
      // chrome — its switch rides the row.
      await waitFor(() => expect(rowNames()).toEqual(["skill-2"]));
      expect(
        screen.getByRole("switch", { name: "关闭 skill-2" }),
      ).toBeInTheDocument();

      // The search fold widens within the installs; the uninstalled catalogue
      // is nested a level deeper and offers no rule yet.
      const more = screen.getByRole("button", {
        name: "查看同仓库其他 2 个已安装 skill",
      });
      expect(
        screen.queryByRole("button", { name: /未安装 skill$/ }),
      ).toBeNull();
      await user.click(more);

      // The other installs continue beneath the match with their switches —
      // and now the catalogue fold stands.
      await waitFor(() => expect(rowNames()).toHaveLength(3));
      expect(rowNames()).toEqual(["skill-2", "skill-0", "skill-1"]);
      expect(
        screen.getByRole("switch", { name: "关闭 skill-0" }),
      ).toBeInTheDocument();
      const catalogue = screen.getByRole("button", {
        name: "查看同仓库其他 1 个未安装 skill",
      });

      // The catalogue unfolds one level deeper still, in store chrome.
      await user.click(catalogue);
      await waitFor(() => expect(rowNames()).toHaveLength(4));
      expect(screen.getByText("skill-3")).toBeInTheDocument();

      // Folding the search fold folds the catalogue nested in it too: the page
      // is the matches alone again.
      await user.click(more);
      await waitFor(() => expect(rowNames()).toEqual(["skill-2"]));
      expect(
        screen.queryByRole("button", { name: /未安装 skill$/ }),
      ).toBeNull();
    });

    it("widens to the ordinary page when the repository answers nothing", async () => {
      bootRegistry(skillsOf(3));
      setQuery("something-this-repository-does-not-have");
      renderRepoPage();

      // No matches here: rather than opening on an empty answer, the page is
      // the repository whole, with nothing folded.
      await waitFor(() => expect(rowNames()).toHaveLength(3));
      expect(
        screen.queryByRole("button", { name: /查看同仓库其他/ }),
      ).toBeNull();
    });

    it("folds the newly ruled-out skills when the query changes", async () => {
      const user = userEvent.setup();
      bootRegistry(skillsOf(4));
      setQuery("skill-1");
      renderRepoPage();

      const fold = await screen.findByRole("button", {
        name: "查看同仓库其他 3 个 skill",
      });
      await user.click(fold);
      await waitFor(() => expect(rowNames()).toHaveLength(4));

      // A different question resets the fold it inherited: the new answer opens
      // on its match alone.
      setQuery("skill-2");
      await waitFor(() => expect(rowNames()).toEqual(["skill-2"]));
      expect(
        screen.getByRole("button", {
          name: "查看同仓库其他 3 个 skill",
        }),
      ).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("carries no group switch in the store reading's head", async () => {
    bootRegistry(skillsOf(2));
    renderRepoPage();

    await screen.findByText("skill-0");
    // The store installs; it has nothing to enable as a group.
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
