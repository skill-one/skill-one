import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  screen,
  fireEvent,
  waitFor,
  within,
  configure,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InstalledPage } from "./installed-page";
import { AppHeader } from "../../components/app-header";
import { renderWithRouter } from "../../test/test-utils";
import {
  addMockLocalSkill,
  getMockInstalledSkills,
  installMockSkill,
  removeMockSkill,
  resetMockAgentStatus,
  resetMockInstalledSkills,
  setMockSkillEnabled,
  setMockSkillInstalledAt,
} from "../../lib/mock-local";
import {
  loadCustomTags,
  resetMockProvenance,
  seedMockCustomTags,
  seedMockProvenance,
} from "../../lib/provenance";
import { resetLinkSuggestions } from "../../lib/link-suggestions";
import { MEDAL_CLASSES } from "../../lib/ordinal";
import {
  getListView,
  resetListView,
  setSort,
  setUnit,
} from "../../lib/list-view";

configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates and the
// page looks up the store entries behind recorded sources; both mocks answer
// "nothing found" by default so the worker-less test env stays silent.
const {
  namesakeSkills,
  lookupSkills,
  getGroups,
  registrySnapshot,
  searchSkillsSh,
} = vi.hoisted(() => ({
  namesakeSkills: vi.fn(),
  lookupSkills: vi.fn(),
  getGroups: vi.fn(),
  // One stable object: the page reads it through useSyncExternalStore, which
  // treats a fresh snapshot on every call as an infinite render loop.
  registrySnapshot: { ready: true, epoch: 1 },
  searchSkillsSh: vi.fn(),
}));
vi.mock("../../lib/registry/client", () => ({
  namesakeSkills,
  lookupSkills,
  getGroups,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

/**
 * The live skills.sh search is stubbed at the module boundary so no case here
 * touches the network: the shared search answer asks it as the query settles on
 * every surface, and the default answer is "nothing here either", which is what
 * keeps the empty state's cases honest. `isSearchableQuery` stays real, so the
 * endpoint's own floor is still exercised.
 */
vi.mock("../../lib/skills-sh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/skills-sh")>()),
  searchSkillsSh,
}));

beforeEach(() => {
  namesakeSkills.mockResolvedValue({ entries: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  getGroups.mockResolvedValue({ groups: [], total: 0 });
  searchSkillsSh.mockResolvedValue([]);
  resetLinkSuggestions();
  // The question, the shape and the order are module state that outlives the
  // page, so each case starts from a list that asks nothing. These tests read
  // the list as repository cards — the shape most were written against — and
  // the ones that want the skill rows pick it themselves.
  resetListView();
  setUnit("installed", "repo");
});

/** The persisted ledger's record for `name` (the store is JSONL). */
function ledgerRecord(
  name: string,
):
  | { name: string; kind?: string; repo?: string; repos?: string[] }
  | undefined {
  return (localStorage.getItem("skill-one.provenance") ?? "")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .find((record) => record.name === name);
}

/**
 * Answers the store-entry lookup with an entry per recorded source, so the
 * installed list carries the registry facts (a classification, a figure) it
 * cannot read off the disk. `downloads` names the ones that have a figure.
 *
 * At file scope rather than inside the describe that first needed it, because
 * three groups ask for store facts and a helper defined in one of them is
 * invisible to the other two.
 */
function seedStoreEntries(
  downloads: Record<string, number> = {},
  domain = "development",
) {
  lookupSkills.mockImplementation(
    async (refs: Array<{ repo: string; name: string }>) => ({
      entries: refs.map((ref) => ({
        name: ref.name,
        repo: ref.repo,
        description: `${ref.name} 的商店描述`,
        stars: 1200,
        downloads: downloads[ref.name] ?? 0,
        path: `skills/${ref.repo}/${ref.name}`,
        profile: { domain: [domain] },
      })),
    }),
  );
}

/** Fires the reveal sentinel once: the run grows by its chunk per fire. */
function triggerReveal(): void {
  (
    globalThis.IntersectionObserver as unknown as {
      instances: Array<{ trigger(intersecting?: boolean): void }>;
    }
  ).instances.at(-1)!.trigger(true);
}

// The page reads installed skills through local-skills, which falls back to
// the mutable mock store in the browser (this test env), so mutations below
// actually change the data the page re-fetches after invalidate.

/**
 * The page as the app mounts it: inside the shell, under the route the deep link
 * arrives on. The list's own row carries the controls the page answers to — the
 * search field among them — so a page mounted alone could be listed but not
 * searched.
 */
function renderPage(route = "/installed") {
  return renderWithRouter(
    <>
      <AppHeader />
      <InstalledPage />
    </>,
    { route },
  );
}

/**
 * Picks the shape the installed list is read in: 列表 (one row per install) or
 * 仓库 (one card per source repository). The shapes stand on the row itself, so
 * this is one press on a named toggle and no popup to open.
 */
async function pickUnit(
  user: ReturnType<typeof userEvent.setup>,
  shape: "列表" | "网格" | "仓库",
) {
  await user.click(screen.getByRole("button", { name: shape }));
}

/**
 * Picks a grouping for the rows: 热度 (the default, most-popular first),
 * 安装时间 (newest first), or 标签 (filed under the classification, biggest
 * group first). Each groups the rows into titled sections. The control is
 * there for the per-skill shapes only — the cards are led by their
 * repository's stars and say so themselves.
 */
async function pickSort(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByRole("button", { name: "分组方式" }));
  await user.click(await screen.findByRole("menuitemradio", { name: label }));
}

describe("InstalledPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
    resetMockProvenance();
    // Agent link exclusions live in localStorage; one test's opt-out must
    // not leak into the next.
    window.localStorage.clear();
  });

  describe("repository cards", () => {
    /**
     * The stack top to bottom, each card paired with the figure its bar leads
     * with: the card's own place in the list. The ordinal is read by *position*
     * — the first thing in the bar's identity — because that is the claim being
     * made about it, and because a card that stated no place would then read as
     * the face's (empty) slot rather than as a number.
     */
    function cardStack(container: HTMLElement) {
      return Array.from(
        container.querySelectorAll('[data-slot="card"][data-repo]'),
      ).map((card) => ({
        repo: card.getAttribute("data-repo") ?? "",
        ordinal:
          card
            .querySelector('[data-slot="card-header"]')
            ?.firstElementChild?.firstElementChild?.textContent?.trim() ?? "",
      }));
    }

    it("numbers the cards in the stars order their own bars already print", async () => {
      // Two recorded sources of different weights, so the stack has an order
      // worth stating. The cards are led by the repository's own stars — the
      // figure the leading card's bar prints a few glyphs along — so the number
      // restates what the list is already answering in rather than introducing an
      // order of its own.
      seedMockProvenance({
        pdf: { repo: "acme/big" },
        docx: { repo: "acme/small" },
      });
      // Only the two sourced installs resolve to a store entry, so the pool keeps
      // no figure at all — which is a fact about the pool (nobody recorded a
      // source to look up), not a figure of zero.
      lookupSkills.mockImplementation(
        async (refs: Array<{ repo: string; name: string }>) => ({
          entries: refs
            .filter((ref) => ref.repo !== "")
            .map((ref) => ({
              name: ref.name,
              repo: ref.repo,
              description: `${ref.name} 的商店描述`,
              stars: ref.repo === "acme/big" ? 9_000 : 500,
              downloads: 0,
              path: `skills/${ref.repo}/${ref.name}`,
              profile: { domain: ["development"] },
            })),
        }),
      );
      const { container } = renderPage();

      await screen.findByText("acme/big");
      // Heaviest first, and the pool last because it has no stars to weigh — the
      // same order the bars themselves imply. It is numbered all the same: it is
      // third in this list, and a card without a figure is a card without a
      // weight, not a card without a place.
      expect(cardStack(container)).toEqual([
        { repo: "acme/big", ordinal: "1" },
        { repo: "acme/small", ordinal: "2" },
        { repo: "", ordinal: "3" },
      ]);
    });

    it("gives every source-less install a home in one repository-style card", async () => {
      renderPage();

      // No install has a recorded source, so every skill lives in one pool card:
      // six skills fit inside the folded cap, so the bar is a plain label and
      // every row is on screen.
      expect(await screen.findByText("第三方安装")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /展开 第三方安装/ }),
      ).toBeNull();
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(6);
    });

    it("renders each installed skill", async () => {
      renderPage();

      expect(await screen.findByText("pdf")).toBeInTheDocument();
      expect(screen.getByText("docx")).toBeInTheDocument();
      expect(screen.getByText("pptx")).toBeInTheDocument();
      // The folded cap is ten: all six fixtures fit inside it, so nothing is
      // hidden behind the bar and there is nothing for it to offer.
      expect(screen.getByText("mcp-builder")).toBeInTheDocument();
      expect(screen.getByText("frontend-design")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /展开 第三方安装/ }),
      ).toBeNull();
    });

    it("caps a repository's card at the folded limit and offers the rest", async () => {
      const user = userEvent.setup();
      // Twelve installs share one repository: the card lists the first ten —
      // five rows of its two-column body — and its bar states the increment,
      // which is what lets a capped list read as "these of them" — and the rest
      // opens in place, with the page one link behind the open card.
      const names = [
        "pdf",
        "docx",
        "pptx",
        "mcp-builder",
        "code-review",
        "frontend-design",
        "extra-a",
        "extra-b",
        "extra-c",
        "extra-d",
        "extra-e",
        "extra-f",
      ];
      for (const name of [
        "extra-a",
        "extra-b",
        "extra-c",
        "extra-d",
        "extra-e",
        "extra-f",
      ]) {
        addMockLocalSkill(name);
      }
      seedMockProvenance(
        Object.fromEntries(names.map((name) => [name, { repo: "acme/tools" }])),
      );
      renderPage();

      const bar = await screen.findByRole("button", {
        name: "展开 acme/tools 的全部 12 个 skill",
      });
      expect(bar).toHaveTextContent("2");
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(10);
      expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();

      await user.click(bar);
      // The rest opens in place, uncapped, without leaving the list.
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(12);
      expect(screen.getByText("frontend-design")).toBeInTheDocument();
    });

    it("removes a skill from its detail panel and updates the stats", async () => {
      const user = userEvent.setup();
      renderPage();

      // No card carries an uninstall control: the whole card body is a click
      // target and removal is irreversible, so the action lives one step away.
      await screen.findByText("pdf");
      expect(screen.queryByTitle("移除")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "查看 pdf 详情" }));
      await user.click(await screen.findByRole("button", { name: "移除" }));

      // The press opens the ask, not the act: the dialog names the skill, and
      // only its destructive confirm removes.
      const ask = await screen.findByRole("dialog", { name: "移除 pdf？" });
      await user.click(within(ask).getByRole("button", { name: "移除" }));

      // The panel closes with the skill: this list shrinks, so the index it was
      // open at would otherwise land on a different skill.
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "移除 pdf？" }),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "查看 pdf 详情" }),
        ).not.toBeInTheDocument();
      });
    });

    it("shows the empty state after removing every skill", async () => {
      const user = userEvent.setup();
      renderPage();

      const cards = () =>
        screen.queryAllByRole("button", { name: /查看 .+ 详情/ });
      // Bounded by the list as it stands, so a removal that does not take effect
      // fails on the turn it went wrong instead of spinning to the timeout. Read
      // after the first paint, since the list arrives asynchronously.
      await waitFor(() => expect(cards().length).toBeGreaterThan(0));

      for (let remaining = cards().length; remaining > 0; remaining--) {
        // Each turn removes the skill it opened rather than "one skill", so a
        // component that dropped the wrong one fails here instead of passing on a
        // count that happened to match.
        const [first] = await screen.findAllByRole("button", {
          name: /查看 .+ 详情/,
        });
        const name = first
          .getAttribute("aria-label")!
          .replace(/^查看 | 详情$/g, "");

        await user.click(first);
        await user.click(await screen.findByRole("button", { name: "移除" }));
        const ask = await screen.findByRole("dialog", {
          name: `移除 ${name}？`,
        });
        await user.click(within(ask).getByRole("button", { name: "移除" }));

        // The panel closes with the skill it removed, so the name that was opened
        // is the name that must be gone from the list.
        await waitFor(() =>
          expect(
            screen.queryByRole("button", { name: `查看 ${name} 详情` }),
          ).not.toBeInTheDocument(),
        );
        expect(cards()).toHaveLength(remaining - 1);
      }

      expect(await screen.findByText("还没有安装任何技能")).toBeInTheDocument();
    });
  });

  describe("the per-card enable switch", () => {
    it("offers group switch per card and toggles all skills on click", async () => {
      const user = userEvent.setup();
      const { container } = renderPage();

      const groupSwitch = await screen.findByRole("switch", {
        name: "全部关闭（第三方安装）",
      });
      expect(groupSwitch).toHaveAttribute("aria-checked", "true");

      await user.click(groupSwitch);
      const off = await screen.findByRole("switch", {
        name: "全部开启（第三方安装）",
      });
      expect(off).toHaveAttribute("aria-checked", "false");
      const rows = container.querySelectorAll("[data-skill]");
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => expect(row).toHaveClass("opacity-60"));

      await user.click(off);
      expect(
        await screen.findByRole("switch", { name: "全部关闭（第三方安装）" }),
      ).toHaveAttribute("aria-checked", "true");
      rows.forEach((row) => expect(row).not.toHaveClass("opacity-60"));
    });

    it("shows half-on state when a skill is disabled and scopes to that card", async () => {
      const user = userEvent.setup();
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      setMockSkillEnabled("pdf", false);
      const { container } = renderPage();

      const poolSwitch = await screen.findByRole("switch", {
        name: "全部关闭（第三方安装）",
      });
      expect(poolSwitch).toHaveAttribute("aria-checked", "true");

      const repoSwitch = await screen.findByRole("switch", {
        name: "全部开启（anthropics/skills）",
      });
      expect(repoSwitch).toHaveAttribute("aria-checked", "false");
      expect(container.querySelector('[data-skill="pdf"]')).toHaveClass("opacity-60");
      expect(container.querySelector('[data-skill="docx"]')).not.toHaveClass("opacity-60");

      await user.click(repoSwitch);
      expect(
        await screen.findByRole("switch", { name: "全部关闭（anthropics/skills）" }),
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("the uninstalled pool", () => {
    it("offers the repository's uninstalled skills as a badge on the bar", async () => {
      const user = userEvent.setup();
      // pdf carries a recorded source and moves into its own repository card;
      // the registry's grouping answers the same repository with one skill the
      // machine does not have.
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      getGroups.mockResolvedValue({
        groups: [
          {
            key: "anthropics/skills",
            title: "anthropics/skills",
            skills: [
              {
                skill: {
                  name: "pdf",
                  repo: "anthropics/skills",
                  description: "PDF 文档读取、生成、合并、拆分与标注。",
                  stars: 1,
                  downloads: 1,
                },
                matched: {},
              },
              {
                skill: {
                  name: "pdf-annotate",
                  repo: "anthropics/skills",
                  description: "为 PDF 添加批注。",
                  stars: 1,
                  downloads: 1,
                },
                matched: {},
              },
            ],
          },
        ],
        total: 2,
      });
      renderPage();

      // The card's bar states how many of its repository's skills are missing:
      // one badge on the bar itself — no row of its own — while the uninstalled
      // skill stays hidden. The bar is the toggle, and its aria counts the
      // card's whole offer (one installed, one uninstalled).
      const bar = await screen.findByRole("button", {
        name: "展开 anthropics/skills 的全部 2 个 skill",
      });
      expect(screen.getByText("1 个未安装")).toBeInTheDocument();
      expect(
        screen.queryByRole("list", {
          name: "anthropics/skills 的未安装 skill",
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("pdf-annotate")).not.toBeInTheDocument();

      // One press on the bar unfolds the uninstalled group in place, and the
      // hairline arrives with it — now there are two lists to keep apart —
      // with the store's install CTA on the row: no switch, and no drawer: an
      // uninstalled row's destination is the install itself. The installed
      // group is untouched: pdf keeps its own row and its switch.
      await user.click(bar);
      const section = screen.getByRole("list", {
        name: "anthropics/skills 的未安装 skill",
      });
      // The group opens with its own marker row under the divider — a minus
      // over the count — so the second list never reads as one with the
      // installed rows.
      expect(
        screen.getByRole("button", {
          name: "展开或收起 anthropics/skills 的 1 个未安装 skill",
        }),
      ).toHaveTextContent("1 个未安装");
      expect(section.parentElement).toHaveClass("border-t");
      expect(within(section).getByText("pdf-annotate")).toBeInTheDocument();
      expect(
        within(section).getByRole("button", { name: "安装" }),
      ).toBeInTheDocument();
      expect(within(section).queryByRole("switch")).toBeNull();

      // A second press folds it back, hairline and all.
      await user.click(bar);
      expect(
        screen.queryByRole("list", {
          name: "anthropics/skills 的未安装 skill",
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("pdf-annotate")).not.toBeInTheDocument();
    });

    it("draws no uninstalled section on the pool card", async () => {
      renderPage();

      // The registry answers nothing for the source-less pool (the mock's
      // grouped answer is empty here): the card lists its installs and offers
      // no repository section at all.
      await screen.findByText("pdf");
      expect(screen.queryByText(/未安装/)).not.toBeInTheDocument();
    });

    it("reveals the uninstalled group in place, in the body's two columns", async () => {
      const user = userEvent.setup();
      // pdf carries a recorded source; the registry answers the same repository
      // with two skills the machine does not have.
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      getGroups.mockResolvedValue({
        groups: [
          {
            key: "anthropics/skills",
            title: "anthropics/skills",
            skills: [
              {
                skill: {
                  name: "pdf",
                  repo: "anthropics/skills",
                  description: "PDF documents.",
                  stars: 1,
                  downloads: 1,
                },
                matched: {},
              },
              {
                skill: {
                  name: "pdf-annotate",
                  repo: "anthropics/skills",
                  description: "Annotate PDFs.",
                  stars: 1,
                  downloads: 1,
                },
                matched: {},
              },
              {
                skill: {
                  name: "pdf-merge",
                  repo: "anthropics/skills",
                  description: "Merge PDFs.",
                  stars: 1,
                  downloads: 1,
                },
                matched: {},
              },
            ],
          },
        ],
        total: 3,
      });
      renderPage();

      const offer = () =>
        screen.getByRole("button", {
          name: "展开 anthropics/skills 的全部 3 个 skill",
        });
      await screen.findByRole("button", {
        name: "展开 anthropics/skills 的全部 3 个 skill",
      });

      // Opening the uninstalled group is a reveal: the group's rows run in the
      // same two columns the installed ones do — one row of them here, so the
      // two columns carry one row.
      await user.click(offer());
      const section = screen.getByRole("list", {
        name: "anthropics/skills 的未安装 skill",
      });
      expect(section).toHaveClass("grid-cols-2");

      // Folding the group hides it again. (Open, the bar's aria speaks of
      // collapsing, so the fold presses the button by its other name.)
      await user.click(
        screen.getByRole("button", {
          name: "收起 anthropics/skills 的 skill 列表",
        }),
      );
      expect(
        screen.queryByRole("list", {
          name: "anthropics/skills 的未安装 skill",
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("the detail drawer", () => {
    it("shows each skill's description", async () => {
      renderPage();

      expect(
        await screen.findByText("PDF 文档读取、生成、合并、拆分与标注。"),
      ).toBeInTheDocument();
    });

    it("opens the shared detail drawer when a row is clicked", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );

      const dialog = await screen.findByRole("dialog");
      // The installed record carries no repo (agents-skills 0.13 records no
      // install source): the panel reads the SKILL.md from the (mock) skills
      // directory and labels the skill 第三方安装.
      expect(within(dialog).getByText("pdf")).toBeInTheDocument();
      expect(within(dialog).getByText("第三方安装")).toBeInTheDocument();
      expect(
        within(dialog).getByText("PDF 文档读取、生成、合并、拆分与标注。"),
      ).toBeInTheDocument();
      // The markdown body is code-split (see skill-detail-panel): it resolves
      // async on first open, so wait for the rendered instructions.
      expect(
        await within(dialog).findByText(
          "（浏览器演示数据：模拟的本地 SKILL.md）",
        ),
      ).toBeInTheDocument();
    });

    it("walks the installed list with the arrow keys inside the drawer", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );
      const dialog = await screen.findByRole("dialog");

      fireEvent.keyDown(window, { key: "ArrowRight" });
      // The drawer now shows the next installed skill (mock order: pdf → docx).
      expect(
        await within(dialog).findByText("以编程方式创建和编辑 Word 文档。"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("docx")).toBeInTheDocument();
    });

    it("labels a no-source skill's drawer as 第三方安装 without repo links", async () => {
      const user = userEvent.setup();
      addMockLocalSkill("my-local");
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 my-local 详情" }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("第三方安装")).toBeInTheDocument();
      expect(
        within(dialog).queryByText("anthropics/skills"),
      ).not.toBeInTheDocument();
    });

    it("keeps the drawer open on the same skill through a link and an unlink", async () => {
      const user = userEvent.setup();
      // One same-slug store entry with a dissimilar description: offered as a
      // candidate, never auto-linked.
      namesakeSkills.mockResolvedValue({
        entries: [
          [
            {
              name: "pdf",
              repo: "anthropics/skills",
              description: "Spreadsheet editing and cell formulas.",
              stars: 1,
              downloads: 2,
            },
          ],
        ],
      });
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );
      const dialog = await screen.findByRole("dialog");

      // Link from inside the drawer: the unlinked skill offers the suggestion
      // badge, and picking a candidate writes the confirmation to the ledger.
      // The popover teleports outside the sheet element, so its contents are
      // queried at the screen level.
      await user.click(
        within(dialog).getByRole("button", { name: "关联 pdf 的商店来源" }),
      );
      await user.click(
        await screen.findByRole("button", { name: /anthropics\/skills/ }),
      );
      await waitFor(() =>
        expect(ledgerRecord("pdf")).toMatchObject({
          repo: "anthropics/skills",
          via: "confirm",
        }),
      );

      // The skill's identity changed (`/pdf` → `anthropics/skills/pdf`), but
      // the drawer follows the row's new key instead of closing — and now
      // presents the linked source.
      expect(
        await within(dialog).findByText("anthropics/skills"),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText("第三方安装")).not.toBeInTheDocument();

      // Unlinking from the change-source menu flips the identity back and
      // still keeps the drawer on the skill.
      await user.click(
        within(dialog).getByRole("button", { name: "更改 pdf 关联的来源" }),
      );
      await user.click(screen.getByRole("button", { name: "解除关联" }));
      // The cut is recorded as a pending record, and the ranking the link was
      // made from survives it — the user's decision does not throw away work.
      await waitFor(() =>
        expect(ledgerRecord("pdf")).toMatchObject({
          kind: "pending",
          repos: ["anthropics/skills"],
        }),
      );
      expect(ledgerRecord("pdf")).not.toHaveProperty("repo");
      expect(await within(dialog).findByText("第三方安装")).toBeInTheDocument();
    }, 20_000);

    it("keeps the drawer open when the open skill is retagged", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );
      const dialog = await screen.findByRole("dialog");

      // The badge itself opens the tag menu — no separate affordance beside
      // it — and the popover teleports outside the sheet element, so its
      // contents are queried at the screen level like the link candidates.
      await user.click(
        within(dialog).getByRole("button", { name: "编辑 pdf 的标签" }),
      );
      await user.click(await screen.findByRole("button", { name: "开发编程" }));
      await waitFor(async () =>
        expect((await loadCustomTags()).skillTags).toEqual({
          pdf: "development",
        }),
      );

      // The choice was made inside the drawer, so unlike a sort change it
      // stays open — and the badge answers the choice live.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(await within(dialog).findByText("开发编程")).toBeInTheDocument();
    }, 20_000);

    it("renames a custom tag from the drawer, moving assignments along", async () => {
      const user = userEvent.setup();
      seedMockCustomTags([{ key: "效率工具", label: "效率工具" }], {
        pdf: "效率工具",
      });
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("效率工具")).toBeInTheDocument();

      // The pencil reuses the creation row as its editor, prefilled with the
      // tag's own label; the popover teleports outside the sheet element, so
      // both are queried at the screen level.
      await user.click(
        within(dialog).getByRole("button", { name: "编辑 pdf 的标签" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "重命名标签 效率工具" }),
      );
      const nameBox = await screen.findByRole("textbox", {
        name: "新建标签…",
      });
      expect(nameBox).toHaveValue("效率工具");
      await user.clear(nameBox);
      await user.type(nameBox, "摸鱼神器");
      await user.click(await screen.findByRole("button", { name: "保存" }));

      // The assignment moved with the rename and the badge answers it, so
      // the drawer stays open throughout.
      await waitFor(async () =>
        expect((await loadCustomTags()).skillTags).toEqual({
          pdf: "摸鱼神器",
        }),
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(await within(dialog).findByText("摸鱼神器")).toBeInTheDocument();
    }, 20_000);

    it("keeps the drawer open when clearing the open skill's tag", async () => {
      const user = userEvent.setup();
      seedMockCustomTags([], { pdf: "development" });
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("开发编程")).toBeInTheDocument();

      // Clearing falls back to the store's classification — unclassified for
      // this local install — but the list no longer narrows by
      // classification, so the skill stays listed and the drawer stays open
      // over it while the badge answers the fallback.
      await user.click(
        within(dialog).getByRole("button", { name: "编辑 pdf 的标签" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "恢复默认分类" }),
      );
      await waitFor(async () =>
        expect((await loadCustomTags()).skillTags).toEqual({}),
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    }, 20_000);

    it("does not open the drawer or the door from the bar's switch", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await user.click(
        await screen.findByRole("switch", { name: "全部关闭（第三方安装）" }),
      );
      // The switch is a sibling of the bar's toggle, not a child: the press
      // toggles the group without opening the drawer. Six skills fit the folded
      // cap, so the bar is a plain label here — there is no door to open.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /展开 第三方安装/ }),
      ).toBeNull();
    });
  });

  describe("what a row says about its source", () => {
    it("uses '暂无描述' as a placeholder when a skill has no description", async () => {
      installMockSkill("no-desc-skill");
      renderPage();

      expect(await screen.findByText("no-desc-skill")).toBeInTheDocument();
      expect(screen.getByText("暂无描述")).toBeInTheDocument();
    });

    it("names a source-less install as 第三方安装 and draws no owner face", async () => {
      const { container } = renderPage();

      await screen.findByText("pdf");
      // Every install here is tool-installed (no ledger entry), so the one card's
      // bar states that in place of a repository, and no owner face joins it.
      const bars = container.querySelectorAll('[data-slot="card-header"]');
      expect(bars).toHaveLength(1);
      expect(bars[0]).toHaveTextContent("第三方安装");
      expect(
        container.querySelectorAll(
          '[data-slot="card-header"] [data-slot="avatar"]',
        ),
      ).toHaveLength(0);
    });

    it("names a recorded source in the card's bar, with the owner's face", async () => {
      const { container } = renderPage();
      // The ledger has a source for pdf (installed through this app); the other
      // five are tool installs with no entry.
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });

      // The sourced skill gets a card of its own, and its bar names the
      // repository: the owner's face and the repo path. One skill, nothing to
      // reveal — so no figure rides the bar.
      await screen.findByText("anthropics/skills");
      for (const bar of container.querySelectorAll(
        '[data-slot="card-header"]',
      )) {
        expect(bar).not.toHaveTextContent(/个 skill/);
      }
      // The other five keep the pool card, whose bar names no repository.
      expect(screen.getAllByText("第三方安装")).toHaveLength(1);
      // Only the sourced card can name an owner, so it carries the only face.
      expect(
        container.querySelectorAll('ul [data-slot="avatar"]'),
      ).toHaveLength(1);
    });

    it("links a sourced skill's detail drawer to its repo instead of 第三方安装", async () => {
      const user = userEvent.setup();
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      renderPage();
      await screen.findByText("pdf");
      // The provenance query lands asynchronously and moves pdf into its own
      // repository card; wait for that reshuffle to settle before clicking, so
      // the row is not detached mid-press.
      await screen.findByText("anthropics/skills");

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );

      const dialog = await screen.findByRole("dialog");
      // The panel now knows the repo: the description is the source link, not
      // the bare 第三方安装 label.
      expect(within(dialog).getByText("anthropics/skills")).toBeInTheDocument();
      expect(within(dialog).queryByText("第三方安装")).not.toBeInTheDocument();
    });

    it("carries the enable switch, and no registry figures, into the drawer", async () => {
      const user = userEvent.setup();
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      renderPage();
      // Same wait: the provenance-driven re-sort settles before the click.
      await screen.findByText("pdf");
      await screen.findByText("anthropics/skills");

      await user.click(
        await screen.findByRole("button", { name: "查看 pdf 详情" }),
      );

      const dialog = await screen.findByRole("dialog");
      // The per-skill switch takes the slot the store's drawer puts its install
      // CTA in — this list installs nothing, its skills are already on disk.
      expect(
        within(dialog).getByRole("switch", { name: "关闭 pdf" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "安装" }),
      ).not.toBeInTheDocument();
      // A recorded repo does not turn the drawer into the store's: there are no
      // registry figures to show, and an install figure rendering as a 0 here
      // would contradict the card, which shows none.
      expect(within(dialog).queryByText("安装量")).not.toBeInTheDocument();

      // The drawer's switch writes the same backend state the bar's does.
      await user.click(
        within(dialog).getByRole("switch", { name: "关闭 pdf" }),
      );
      expect(
        await within(dialog).findByRole("switch", { name: "开启 pdf" }),
      ).toHaveAttribute("aria-checked", "false");
    });

    it("shows the store's classification and install count for a resolved source", async () => {
      const user = userEvent.setup();
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      // The registry still lists the source the ledger recorded, so the installed
      // list has the store facts an on-disk record never carries.
      lookupSkills.mockResolvedValue({
        entries: [
          {
            name: "pdf",
            repo: "anthropics/skills",
            description: "PDF 文档读取、生成、合并、拆分与标注。",
            stars: 169600,
            downloads: 2991984,
            path: "skills/anthropics/skills/pdf",
            profile: { domain: ["content-creation"] },
          },
        ],
      });
      renderPage();

      // The resolved entry is what classifies the install, and the card's bar
      // prints the repository's stars, the same figure the store's own cards
      // carry.
      expect(await screen.findByTitle("169600 stars")).toBeInTheDocument();

      // The drawer states the classification and the store figure the compact
      // repository row has no room for.
      await user.click(screen.getByRole("button", { name: "查看 pdf 详情" }));
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByLabelText("热度 712.4K：安装 3M · Star 169.6K"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("内容创作")).toBeInTheDocument();
    });

    it("shows no store facts for a source the registry no longer lists", async () => {
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      // The lookup answers nothing for the ref (a fork the index dropped, say):
      // the card keeps the recorded source — its bar is what names it — and shows
      // no classification and no figure: an absent fact is not a zero one.
      renderPage();

      expect(await screen.findByText("anthropics/skills")).toBeInTheDocument();
      expect(screen.queryByText("内容创作")).not.toBeInTheDocument();
      expect(screen.queryByTitle(/stars/)).toBeNull();
    });
  });

  describe("offering a store source", () => {
    it("offers a confirmable store link for a tool-installed skill", async () => {
      const user = userEvent.setup();
      // The registry carries a same-slug entry whose description is *different*
      // enough (< 90%) from the installed skill's: because it is below the
      // auto-link threshold, the card offers the association for the user to
      // confirm instead of linking silently.
      namesakeSkills.mockResolvedValue({
        entries: [
          [
            {
              name: "pdf",
              repo: "anthropics/skills",
              description: "Convert PDF files to images and text.",
              stars: 99,
              downloads: 99,
              path: "skills/anthropics/skills/pdf",
            },
          ],
        ],
      });
      renderPage();
      await pickUnit(user, "列表");

      const badge = await screen.findByRole("button", {
        name: "关联 pdf 的商店来源",
      });
      await user.click(badge);

      // The popover lists the namesake candidates; clicking one confirms the
      // source link right there — no second dialog.
      const candidate = await screen.findByRole("button", {
        name: /anthropics\/skills/,
      });
      expect(screen.getByText(/\d+%/)).toBeInTheDocument();
      await user.click(candidate);

      // The association becomes indistinguishable from a native install: pdf now
      // lives in its own repository card, whose bar names the source, and the
      // affordance is gone.
      await pickUnit(user, "仓库");
      expect(await screen.findByText("anthropics/skills")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
      ).not.toBeInTheDocument();
      // And the persisted ledger carries the pick.
      expect(ledgerRecord("pdf")?.repo).toBe("anthropics/skills");
    });

    it("auto-links a tool-installed skill whose description matches a namesake", async () => {
      // Identical wording (≥ 90% similarity) is treated as the same skill and
      // linked automatically — no 关联来源 badge or confirm dialog ever appears.
      namesakeSkills.mockResolvedValue({
        entries: [
          [
            {
              name: "pdf",
              repo: "anthropics/skills",
              description: "PDF 文档读取、生成、合并、拆分与标注。",
              stars: 99,
              downloads: 99,
              path: "skills/anthropics/skills/pdf",
            },
          ],
        ],
      });
      renderPage();

      // No link-source affordance — it linked on its own.
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
        ).not.toBeInTheDocument(),
      );
      // The persisted ledger already carries the source the auto-link wrote.
      await waitFor(() =>
        expect(ledgerRecord("pdf")?.repo).toBe("anthropics/skills"),
      );
      // And pdf's card now names the source it was linked to on its own.
      await screen.findByText("anthropics/skills");
    });
  });

  describe("ordering", () => {
    // The repository unit (the default): one card per source, the cards ordered
    // by each card's newest install.

    /** The cards in list order, named by the repository each one stands for
     *  (the pool card, which has no repository, names itself). The cards render
     *  inside the sheet's portal, so the caller hands in the render's
     *  `baseElement` — the only handle that reaches them. */
    function cardBarNames(scope: ParentNode): string[] {
      return Array.from(
        scope.querySelectorAll('[data-slot="card"][data-repo]'),
      ).map((card) => card.getAttribute("data-repo") || "第三方安装");
    }

    it("orders the repository unit's cards by each card's newest install", async () => {
      // Mock install ages: pdf today, docx 3 days, pptx 12, mcp-builder 45,
      // code-review 200, frontend-design 400. The ledgers split them three ways:
      // a one-skill repo fresh today, the pool (docx/pptx, newest 3 days), and a
      // repo whose skills are all old (newest 45 days).
      seedMockProvenance({
        pdf: { repo: "zoo/new" },
        "mcp-builder": { repo: "acme/tools" },
        "code-review": { repo: "acme/tools" },
        "frontend-design": { repo: "acme/tools" },
      });
      const { baseElement } = renderPage();

      await screen.findByText("zoo/new");
      // One flat list, newest install first: the fresh repository leads, the
      // pool follows on the age of its newest member, the all-old repository
      // trails.
      expect(cardBarNames(baseElement)).toEqual([
        "zoo/new",
        "第三方安装",
        "acme/tools",
      ]);
    });

    it("orders a card by its newest install and lists that install first", async () => {
      // One repository holds both a fresh install (pdf, today) and an ancient one
      // (frontend-design, 400 days): the card leads the list on the fresh
      // install's age — and the fresh install leads the card's preview instead
      // of hiding past the cap.
      seedMockProvenance({
        pdf: { repo: "acme/tools" },
        "frontend-design": { repo: "acme/tools" },
      });
      const { baseElement } = renderPage();

      await screen.findByText("acme/tools");
      // The pool (newest docx, 3 days) is the other, older card.
      expect(cardBarNames(baseElement)).toEqual(["acme/tools", "第三方安装"]);

      // Inside the card, newest first.
      const card = baseElement.querySelector('[data-repo="acme/tools"]');
      expect(
        within(card as HTMLElement)
          .getAllByRole("button", { name: /查看 .+ 详情/ })
          .map((node) => node.getAttribute("aria-label")),
      ).toEqual(["查看 pdf 详情", "查看 frontend-design 详情"]);
    });

    it("leads the repository shape with the most-starred repository", async () => {
      // zoo/a holds one install of a 400-starred skill; zoo/b two installs of
      // a 50-starred one; the pool has no figure at all. The card shape orders
      // the cards by the repository's stars — not by how many skills it
      // placed or how fresh they are — and the figure-less pool trails.
      seedMockProvenance({
        pdf: { repo: "zoo/a" },
        docx: { repo: "zoo/b" },
        pptx: { repo: "zoo/b" },
      });
      lookupSkills.mockResolvedValue({
        entries: [
          {
            name: "pdf",
            repo: "zoo/a",
            description: "PDF documents.",
            stars: 400,
            downloads: 1,
            path: "skills/zoo/a/pdf",
          },
          {
            name: "docx",
            repo: "zoo/b",
            description: "Word documents.",
            stars: 50,
            downloads: 1,
            path: "skills/zoo/b/docx",
          },
          {
            name: "pptx",
            repo: "zoo/b",
            description: "Slide decks.",
            stars: 50,
            downloads: 1,
            path: "skills/zoo/b/pptx",
          },
        ],
      });
      const { baseElement } = renderPage();
      await screen.findByText("zoo/a");

      // beforeEach picked the card shape, and the pressed toggle says so. A card
      // is a repository led by its own stars, so the row orders — an install
      // clock, a token cost — are not on offer in this shape and the sort control
      // is gone rather than standing there promising a pick that changes nothing.
      expect(screen.getByRole("button", { name: "仓库" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        screen.queryByRole("button", { name: "分组方式" }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(cardBarNames(baseElement)).toEqual([
          "zoo/a",
          "zoo/b",
          "第三方安装",
        ]),
      );
    });

    it("keeps each repository card's rows newest-first under the repository sort", async () => {
      // The card shape orders the *cards* by stars; inside a card, the rows
      // still answer to the card's own clock — the fresh install leads the
      // preview instead of hiding past the cap.
      seedMockProvenance({
        pdf: { repo: "acme/tools" },
        "frontend-design": { repo: "acme/tools" },
      });
      lookupSkills.mockResolvedValue({
        entries: [
          {
            name: "pdf",
            repo: "acme/tools",
            description: "PDF documents.",
            stars: 400,
            downloads: 1,
            path: "skills/acme/tools/pdf",
          },
          {
            name: "frontend-design",
            repo: "acme/tools",
            description: "Design guidance.",
            stars: 400,
            downloads: 1,
            path: "skills/acme/tools/frontend-design",
          },
        ],
      });
      const { baseElement } = renderPage();
      await screen.findByText("acme/tools");

      const card = baseElement.querySelector('[data-repo="acme/tools"]');
      expect(
        within(card as HTMLElement)
          .getAllByRole("button", { name: /查看 .+ 详情/ })
          .map((node) => node.getAttribute("aria-label")),
      ).toEqual(["查看 pdf 详情", "查看 frontend-design 详情"]);
    });

    it("walks the drawer in the cards' newest-first order", async () => {
      const user = userEvent.setup();
      seedMockProvenance({
        pdf: { repo: "zoo/new" },
        "mcp-builder": { repo: "acme/tools" },
        "code-review": { repo: "acme/tools" },
        "frontend-design": { repo: "acme/tools" },
      });
      renderPage();

      await screen.findByText("zoo/new");
      // pdf is the only row of the freshest card; the next thing the walk reaches
      // is the pool's own newest row (docx, 3 days back) — the card boundary does
      // not interrupt the walk.
      const pdfButton = await screen.findByRole("button", {
        name: "查看 pdf 详情",
      });
      await user.click(pdfButton);
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("pdf")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "ArrowRight" });
      // The drawer now shows the pool's own newest install (docx), identified by
      // its description the same way the other drawer test names it.
      expect(
        await within(dialog).findByText("以编程方式创建和编辑 Word 文档。"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("docx")).toBeInTheDocument();
    });

    // The skill unit: the store's second reading of the same installs — one row
    // per skill rather than one card per source, ordered newest-first. The
    // page's own mocks serve it.

    /** The four installs the one-source tests gather into one source. */
    const RUN_SOURCE = ["pdf", "docx", "pptx", "mcp-builder"];

    /** Records one source for every name of the set. */
    function seedRunSource(repo = "acme/tools") {
      seedMockProvenance(
        Object.fromEntries(RUN_SOURCE.map((name) => [name, { repo }])),
      );
    }

    /**
     * Answers the store-entry lookup with an entry per recorded source, so the
     * installed list carries the registry facts (a classification, a figure) it
     * cannot read off the disk. `downloads` names the ones that have a figure.
     */
    it("lists every install as its own row in the skill unit", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");

      // One row per install, uncapped: this is the whole list, so the unit that
      // reads it one skill at a time reads all of it.
      expect(
        await screen.findAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(6);
      // No card, so no bar: nothing in this unit is a door to a repository.
      expect(screen.queryByRole("link", { name: /^查看仓库 / })).toBeNull();
      expect(screen.queryByRole("link", { name: /^查看第三方安装/ })).toBeNull();
      // The enable switch rides the row, so both units manage the same skills.
      expect(screen.getAllByRole("switch")).toHaveLength(6);
    });

    it("orders the skill unit's installs newest first", async () => {
      const user = userEvent.setup();
      // Every install is a tool install here; their mock ages spread across six
      // distinct days (0 / 3 / 12 / 45 / 200 / 400 days ago), so each has a
      // distinct place in the ordering.
      renderPage();
      await screen.findByText("pdf");

      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });

      // One flat list, newest first: pdf landed today, docx three days ago,
      // pptx twelve, then the old installs — 45, 200, then 400 days ago.
      expect(
        screen
          .getAllByRole("button", { name: /查看 .+ 详情/ })
          .map((node) => node.getAttribute("aria-label")),
      ).toEqual([
        "查看 pdf 详情",
        "查看 docx 详情",
        "查看 pptx 详情",
        "查看 mcp-builder 详情",
        // The one mock row whose frontmatter name folds differently than its
        // slug: the aria label names the display spelling.
        "查看 Code Review 详情",
        "查看 frontend-design 详情",
      ]);

      // The installed list folds nothing: no row hides behind one.
      expect(
        screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
      ).toBeNull();
    });

    it("shows each row's install stamp under the time sort, the blend under popularity", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");

      // The figure a row states is the one the list is ordered by: every
      // install carries its stamp (a local fact — no store entry needed), so
      // the slots read as ages, newest first — pdf landed today ("刚刚").
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });
      const stamps = screen.getAllByLabelText(/^安装于 /);
      expect(stamps.length).toBeGreaterThanOrEqual(5);
      expect(stamps[0]).toHaveTextContent("刚刚");
      expect(stamps[1]).toHaveTextContent("3天前");

      // Picking 热度 re-answers the list and its slots together: the stamps
      // leave with the ordering they belonged to. (No store entry resolves
      // here, so the rows state no blend either — an absent fact, not a zero.)
      // The switch goes through the same `setSort` call the menu item's change
      // makes — jsdom never runs the popup's closing animation, so its content
      // stays mounted and a second open/close cycle cannot be clicked through.
      setSort("installed", "popularity");
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });
      expect(screen.queryByLabelText(/^安装于 /)).toBeNull();
    });

    it("orders one source's several installs by time instead of folding them", async () => {
      const user = userEvent.setup();
      // Four installs share one source the registry still lists: where the old
      // install-count ranking folded them behind one row, the time order lists
      // every one.
      seedRunSource();
      seedStoreEntries({ pdf: 30, docx: 20, pptx: 10, "mcp-builder": 5 });
      renderPage();

      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");

      // Every install keeps its own row, across the day groups...
      expect(
        await screen.findAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(6);
      // ...and no run fold survives from the store-style ranking.
      expect(
        screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
      ).toBeNull();
    });

    it("re-orders the skill unit by popularity from the sort select", async () => {
      const user = userEvent.setup();
      // Four installs carry a store figure, spread against their install ages:
      // docx (50) most-installed but 3 days old, pdf (30) fresh, pptx (20),
      // mcp-builder (5); code-review and frontend-design resolve no entry, so
      // they carry the adapter's honest zero. The entries share one star count,
      // so the blend ranks exactly as the install counts do.
      seedRunSource();
      seedStoreEntries({ docx: 50, pdf: 30, pptx: 20, "mcp-builder": 5 });
      renderPage();
      // The shape switch answers what the list is made of; the order then
      // answers which way the rows read. 热度 is the default, so the select marks
      // it on arrival too.
      await pickUnit(user, "列表");
      await pickSort(user, "热度");
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });
      expect(
        screen.getByRole("button", { name: "分组方式" }),
      ).toHaveTextContent("热度");

      // Most-popular first, regardless of how fresh the install is; the
      // figure-less installs sink below every figure, and among themselves
      // they keep the install-time order the list was answering in.
      expect(
        screen
          .getAllByRole("button", { name: /查看 .+ 详情/ })
          .map((node) => node.getAttribute("aria-label")),
      ).toEqual([
        "查看 docx 详情",
        "查看 pdf 详情",
        "查看 pptx 详情",
        "查看 mcp-builder 详情",
        "查看 Code Review 详情",
        "查看 frontend-design 详情",
      ]);
    });
  });

  describe("the skill unit", () => {
    it("walks the skill unit's newest-first time order in the detail drawer", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");

      // The walk follows the newest-first time order: after code-review (200
      // days) the next install is frontend-design (400) — one press lands there,
      // never back on a newer install. The row answers by its display name.
      await user.click(
        await screen.findByRole("button", { name: "查看 Code Review 详情" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Code Review")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(
        await within(dialog).findByText("frontend-design"),
      ).toBeInTheDocument();
    });
  });

  /**
   * The per-skill shapes read in titled sections of ten, in the chosen
   * grouping's order. The header names the rank range it covers and the badge
   * states what it actually lists; every section opens on arrival, and a
   * press on the header folds it.
   */
  describe("the rank sections in the skill unit", () => {
    /** Enough extra installs to spill past the first section of ten. */
    function seedEighteenInstalls() {
      for (let i = 0; i < 12; i += 1) {
        addMockLocalSkill(`extra-${i}`);
      }
    }

    it("renders live installs as a continuous flat list without rank grouping", async () => {
      seedEighteenInstalls();
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");

      // Under popularity sort, artificial rank sections ("1–10", "11–18") are omitted.
      expect(screen.queryByRole("region", { name: "1–10" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "11–18" })).not.toBeInTheDocument();

      // Progressive reveal carries all 18 installs into one flat list.
      triggerReveal();
      triggerReveal();
      await waitFor(() =>
        expect(screen.getAllByRole("listitem")).toHaveLength(18),
      );
    });

    it("renders live installs as a continuous flat grid without rank grouping", async () => {
      seedEighteenInstalls();
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "网格");

      expect(screen.queryByRole("region", { name: "1–10" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "11–18" })).not.toBeInTheDocument();

      triggerReveal();
      triggerReveal();
      await waitFor(() =>
        expect(screen.getAllByRole("listitem")).toHaveLength(18),
      );
    });

    it("offers exactly the three groupings from the menu", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      await user.click(screen.getByRole("button", { name: "分组方式" }));
      const menu = await screen.findByRole("menu");
      expect(
        within(menu)
          .getAllByRole("menuitemradio")
          .map((item) => item.textContent),
      ).toEqual(["热度", "安装时间", "标签"]);
      await user.keyboard("{Escape}");
    });
  });

  /**
   * Under the install-clock grouping the sections are the time itself: 今天 /
   * 昨天 / 最近 7 天 / 最近 30 天 / 更早. The mock's install ages (0, 3, 12,
   * 45, 200, 400 days) fall one per rolling window, which is what lets each
   * bucket be asserted in isolation; empty buckets draw no section at all.
   */
  describe("the time buckets in the skill unit", () => {
    it("files each install into the time bucket its age falls in", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");
      await screen.findByText("frontend-design");

      // pdf is installed today, docx three days ago, pptx twelve, and the
      // rest older than a month — so 今天, 最近 7 天 and 最近 30 天 hold one
      // row each, 更早 the other three, and no 昨天 bucket exists to draw.
      expect(screen.getByRole("region", { name: "今天" })).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "昨天" }),
      ).not.toBeInTheDocument();
      const last7 = screen.getByRole("region", { name: "最近 7 天" });
      expect(
        within(last7).getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(1);
      const earlier = screen.getByRole("region", { name: "更早" });
      expect(
        within(earlier)
          .getAllByRole("button", { name: /查看 .+ 详情/ })
          .map((node) => node.getAttribute("aria-label")),
      ).toEqual([
        "查看 mcp-builder 详情",
        "查看 Code Review 详情",
        "查看 frontend-design 详情",
      ]);
      expect(
        within(earlier).getByRole("button", { name: /^更早/ }),
      ).toHaveTextContent("3 个 skill");
    });

    it("files an install with no recorded stamp under 更早", async () => {
      setMockSkillInstalledAt("pdf", null);
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");
      await screen.findByText("frontend-design");

      // No stamp reads last, so 今天 has nothing to draw and pdf lands at
      // the end of 更早 — an unreadable clock is not a fresh one.
      expect(
        screen.queryByRole("region", { name: "今天" }),
      ).not.toBeInTheDocument();
      const earlier = screen.getByRole("region", { name: "更早" });
      const names = within(earlier)
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((node) => node.getAttribute("aria-label"));
      expect(names).toHaveLength(4);
      expect(names.at(-1)).toBe("查看 pdf 详情");
    });
  });

  /**
   * Under the tag grouping the sections are the classifications themselves:
   * the user's own tag where one was picked, else the store's domain, else
   * 未分类 — each install filed under its leading key only, the groups read
   * biggest first with the taxonomy's own order breaking the ties, and the
   * rows inside a section keeping the popularity order the default grouping
   * answers in.
   */
  describe("the tag sections in the skill unit", () => {
    /** The rows a region lists, named as their detail buttons name them. */
    function rowsOf(region: HTMLElement): (string | null)[] {
      return within(region)
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((node) => node.getAttribute("aria-label"));
    }

    /**
     * A recorded source and a store classification for every install but
     * frontend-design, unevenly spread: three under 开发编程, one each under
     * 数据分析 and 内容创作, and the one tool install unclassified — a clear
     * winner for the count order, a tie for the taxonomy rank to break, and
     * 未分类 reading last. `downloads` weights the within-section popularity
     * order the way the default grouping would read it.
     */
    function seedClassifiedInstalls(downloads: Record<string, number> = {}) {
      seedMockProvenance({
        pdf: { repo: "acme/one" },
        docx: { repo: "acme/two" },
        pptx: { repo: "acme/three" },
        "mcp-builder": { repo: "acme/four" },
        "code-review": { repo: "acme/five" },
      });
      const domains: Record<string, string[]> = {
        pdf: ["development"],
        docx: ["development"],
        pptx: ["development"],
        "mcp-builder": ["data-analysis"],
        "code-review": ["content-creation"],
      };
      lookupSkills.mockImplementation(
        async (refs: Array<{ repo: string; name: string }>) => ({
          entries: refs.map((ref) => ({
            name: ref.name,
            repo: ref.repo,
            description: `${ref.name} 的商店描述`,
            stars: 1200,
            downloads: downloads[ref.name] ?? 0,
            path: `skills/${ref.repo}/${ref.name}`,
            profile: { domain: domains[ref.name] ?? [] },
          })),
        }),
      );
    }

    it("files each install under its classification, biggest group first", async () => {
      seedClassifiedInstalls();
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");
      await screen.findByText("frontend-design");

      // The counts each header states, and the taxonomy's own rank breaking
      // the one-way tie (数据分析 before 内容创作), with the skill nothing
      // classified reading last under its own header.
      expect(
        screen.getByRole("region", { name: "开发编程" }),
      ).toHaveTextContent("3 个 skill");
      expect(
        screen.getByRole("region", { name: "数据分析" }),
      ).toHaveTextContent("1 个 skill");
      expect(
        screen.getByRole("region", { name: "内容创作" }),
      ).toHaveTextContent("1 个 skill");
      expect(
        screen.getByRole("region", { name: "未分类" }),
      ).toHaveTextContent("1 个 skill");
      // The section order is the count order, not the taxonomy's — and an
      // empty classification (测试与质量) draws no section at all.
      expect(
        screen.queryByRole("region", { name: "测试与质量" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByRole("region").map((region) => region.ariaLabel),
      ).toEqual(["开发编程", "数据分析", "内容创作", "未分类"]);
    });

    it("leads each tag header with the classification's emoji", async () => {
      seedClassifiedInstalls();
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");
      await screen.findByText("frontend-design");

      // Each header carries its classification's own mark — the same
      // resolver the row badges and the tag picker call — riding beside the
      // label rather than inside it, so the accessible name stays the label.
      const headerEmoji = (regionName: string) => {
        const region = screen.getByRole("region", { name: regionName });
        const trigger = region.querySelector<HTMLElement>(
          "button[data-slot='collapsible-trigger']",
        );
        const glyph = trigger?.querySelector("span[aria-hidden='true']");
        return {
          text: glyph?.textContent,
          ariaHidden: glyph?.getAttribute("aria-hidden"),
        };
      };
      expect(headerEmoji("开发编程")).toEqual({ text: "💻", ariaHidden: "true" });
      expect(headerEmoji("数据分析")).toEqual({ text: "📊", ariaHidden: "true" });
      expect(headerEmoji("内容创作")).toEqual({ text: "✍️", ariaHidden: "true" });
      // Nothing classified wears the question mark the row badges wear too.
      expect(headerEmoji("未分类")).toEqual({ text: "❓", ariaHidden: "true" });
    });

    it("files a tagged install under the user's tag, not the store's domain", async () => {
      seedClassifiedInstalls();
      // The single select overrides the store's answer: pdf carries a hand
      // file even though the store classified it under 开发编程.
      seedMockCustomTags(
        [{ key: "效率工具", label: "效率工具", emoji: "⚡" }],
        { pdf: "效率工具" },
      );
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");
      await screen.findByText("frontend-design");

      // pdf moved out of the store's classification into the user's own
      // section, which the badges and this grouping read alike.
      const dev = screen.getByRole("region", { name: "开发编程" });
      expect(rowsOf(dev)).toEqual([
        "查看 docx 详情",
        "查看 pptx 详情",
      ]);
      expect(dev).toHaveTextContent("2 个 skill");
      expect(
        rowsOf(screen.getByRole("region", { name: "效率工具" })),
      ).toEqual(["查看 pdf 详情"]);
    });

    it("files a multi-domain install under its leading classification only", async () => {
      seedMockProvenance({
        pdf: { repo: "acme/one" },
        docx: { repo: "acme/two" },
      });
      // One store entry naming two domains: the grouping files the skill
      // under the first, the way the row badge reads its leading key.
      lookupSkills.mockImplementation(
        async (refs: Array<{ repo: string; name: string }>) => ({
          entries: refs.map((ref) => ({
            name: ref.name,
            repo: ref.repo,
            description: `${ref.name} 的商店描述`,
            stars: 1200,
            downloads: 0,
            path: `skills/${ref.repo}/${ref.name}`,
            profile:
              ref.name === "pdf"
                ? { domain: ["development", "data-analysis"] }
                : { domain: ["data-analysis"] },
          })),
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");
      await screen.findByText("frontend-design");

      // pdf reads once — under 开发编程 — and never again under 数据分析,
      // which holds docx alone (the other four installs carry no store
      // entry, so they pool under 未分类).
      expect(
        rowsOf(screen.getByRole("region", { name: "开发编程" })),
      ).toEqual(["查看 pdf 详情"]);
      expect(
        rowsOf(screen.getByRole("region", { name: "数据分析" })),
      ).toEqual(["查看 docx 详情"]);
      expect(
        screen.getAllByRole("button", { name: "查看 pdf 详情" }),
      ).toHaveLength(1);
    });

    it("orders each section by popularity and numbers it from its own top", async () => {
      seedClassifiedInstalls({ docx: 50, pdf: 30, pptx: 10 });
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");
      await screen.findByText("frontend-design");

      // Within a section the rows keep the popularity order the default
      // grouping answers in — the same figure the rows themselves display.
      const dev = screen.getByRole("region", { name: "开发编程" });
      expect(rowsOf(dev)).toEqual([
        "查看 docx 详情",
        "查看 pdf 详情",
        "查看 pptx 详情",
      ]);
      // The ordinal run restarts per section: the tag's own top three wear
      // the podium, and 数据分析's single row wears gold again — the number
      // states a place within the tag, not across the whole list.
      const inks = Array.from(
        dev.querySelectorAll("li span.w-6"),
      ).map((span) => span.className);
      expect(inks[0]).toContain(MEDAL_CLASSES[0]);
      expect(inks[1]).toContain(MEDAL_CLASSES[1]);
      expect(inks[2]).toContain(MEDAL_CLASSES[2]);
      const solo = screen.getByRole("region", { name: "数据分析" });
      expect(
        solo.querySelectorAll("li span.w-6")[0].className,
      ).toContain(MEDAL_CLASSES[0]);
    });

    it("preserves stable tag section order and fills progressively when installs exceed initial chunk", async () => {
      // 14 skills: 8 in development, 4 in data-analysis, 2 in office-productivity.
      // Initial chunk is 6, so progressive reveal triggers across chunks.
      const names = [
        "dev-1", "dev-2", "dev-3", "dev-4", "dev-5", "dev-6", "dev-7", "dev-8",
        "data-1", "data-2", "data-3", "data-4",
        "office-1", "office-2",
      ];
      const existingNames = getMockInstalledSkills().map((skill) => skill.name);
      for (const name of existingNames) {
        removeMockSkill(name);
      }
      for (const name of names) {
        addMockLocalSkill(name);
      }
      seedMockProvenance(
        Object.fromEntries(names.map((name) => [name, { repo: "acme/repo" }])),
      );
      lookupSkills.mockImplementation(
        async (refs: Array<{ repo: string; name: string }>) => ({
          entries: refs.map((ref) => ({
            name: ref.name,
            repo: ref.repo,
            description: `${ref.name} desc`,
            stars: 1000,
            downloads: 0,
            path: `skills/${ref.repo}/${ref.name}`,
            profile: {
              domain: [
                ref.name.startsWith("dev-")
                  ? "development"
                  : ref.name.startsWith("data-")
                    ? "data-analysis"
                    : "office-productivity",
              ],
            },
          })),
        }),
      );

      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");

      // Initial chunk (6): only the first 6 items of the leading tag (开发编程) are mounted
      const devSection = await screen.findByRole("region", { name: "开发编程" });
      expect(rowsOf(devSection)).toHaveLength(6);
      expect(screen.queryByRole("region", { name: "数据分析" })).toBeNull();
      expect(screen.queryByRole("region", { name: "办公效率" })).toBeNull();

      // The header states the section's whole size from the first frame — the
      // answer already knows it — so the count never rewrites itself as the
      // reveal grows: 6 mounted rows, but 8 skills named.
      expect(devSection).toHaveTextContent("8 个 skill");

      // Scrolling sentinel into view reveals the rest of the answer
      triggerReveal();
      await waitFor(() => expect(rowsOf(devSection)).toHaveLength(8));
      // The reveal caught the count up to itself: the header's figure is the
      // same one it led with, now matching the rows it lists.
      expect(devSection).toHaveTextContent("8 个 skill");
      const dataSection = await screen.findByRole("region", { name: "数据分析" });
      await waitFor(() => expect(rowsOf(dataSection)).toHaveLength(4));
      expect(dataSection).toHaveTextContent("4 个 skill");
      const officeSection = await screen.findByRole("region", { name: "办公效率" });
      await waitFor(() => expect(rowsOf(officeSection)).toHaveLength(2));
      expect(officeSection).toHaveTextContent("2 个 skill");

      // Section order is strictly stable: 开发编程 -> 数据分析 -> 办公效率
      expect(
        screen.getAllByRole("region").map((region) => region.ariaLabel),
      ).toEqual(["开发编程", "数据分析", "办公效率"]);
    });

    it("traverses detail drawer in screen order across tag sections with arrow keys", async () => {
      seedClassifiedInstalls({ docx: 50, pdf: 30, pptx: 10 });
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "标签");
      await screen.findByText("frontend-design");

      // Open the last skill of 开发编程 (pptx)
      const pptxButton = await screen.findByRole("button", {
        name: "查看 pptx 详情",
      });
      await user.click(pptxButton);
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("pptx")).toBeInTheDocument();

      // Press ArrowRight: moves to the first skill of the next tag section (数据分析 -> mcp-builder)
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(within(dialog).getByText("mcp-builder")).toBeInTheDocument();

      // Press ArrowRight: moves to 内容创作 -> Code Review
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(within(dialog).getByText("Code Review")).toBeInTheDocument();

      // Press ArrowRight: moves to 未分类 -> frontend-design
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(within(dialog).getByText("frontend-design")).toBeInTheDocument();
    });
  });

  /**
   * The installed list's rows and the repository cards it also lists share one
   * ordinal mark, podium included: a row numbers its position in the order the
   * reader picked and the first three of that order are coloured. The claim is
   * about the *chosen* order rather than about weight, so it is stated per order
   * — including the two orders that are not a contest in the ordinary sense,
   * which is the point of the claim being about the reader's choice.
   */
  describe("the installed rows' podium", () => {
    /** Each row's ordinal ink, in document order. */
    function inks(): string[] {
      return Array.from(document.querySelectorAll("li span.w-6")).map(
        (span) => span.className,
      );
    }

    const podium = (position: number) => inks()[position];

    it("colours the leading three under the default order", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // 热度 is a ranking and the row prints the figure it ranks by, so the first
      // three wear gold, silver and bronze — the same ink the store's rows and the
      // repository cards wear, because it is the same mark.
      expect(podium(0)).toContain(MEDAL_CLASSES[0]);
      expect(podium(1)).toContain(MEDAL_CLASSES[1]);
      expect(podium(2)).toContain(MEDAL_CLASSES[2]);
      // Fourth place is out of the podium, in either list.
      expect(podium(3)).toContain("text-muted-foreground");
    });

    it("still colours them under the install clock", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // 安装时间 reads as a timeline, so this is where a medal is most
      // easily over-read as a weight. The list is content to call its own
      // order a ranking anyway: the reader picked the order, and the number
      // states a place in exactly that. Its own case, so relaxing one
      // comparator cannot quietly relax the claim for the others.
      await pickSort(user, "安装时间");
      await waitFor(() => expect(podium(0)).toContain(MEDAL_CLASSES[0]));
      expect(podium(1)).toContain(MEDAL_CLASSES[1]);
      expect(podium(2)).toContain(MEDAL_CLASSES[2]);
    });

    it("wears the same mark as the repository cards beside it", async () => {
      // The two shapes of this list, on one page: the rows above and the cards
      // the shape toggle offers are numbered by one component, so switching the
      // shape cannot change the ink.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      const rowInk = podium(0);

      await pickUnit(user, "仓库");
      await waitFor(() =>
        expect(
          document.querySelector('[data-slot="card-header"]')!
            .firstElementChild!.firstElementChild!.className,
        ).toBe(rowInk),
      );
    });
  });

  /**
   * The one thing about the skill unit's order the reader does not get to pick:
   * a disabled install is parked below every live one, in a section of its own,
   * under both groupings alike. Enablement is not a third grouping — it is a
   * partition of whichever grouping was chosen — so the tests below hold the
   * *relative* claim ("no parked row above a live row") rather than a snapshot of
   * one grouping, and pin the concrete grouping only where it is knowable up front.
   */
  describe("the parked section in the skill unit", () => {
    /** The skill rows on screen, in the order the document draws them — which is
     *  the order the reader reads, across both groups. */
    function rowNames(): string[] {
      return screen
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((node) => node.getAttribute("aria-label") ?? "");
    }

    /** The parked group: the section `CollapsibleSection` draws, reached by its
     *  own name rather than by position, so a test states which group it means.
     *  It exists only while something is parked, and it starts folded. */
    function parkedSection(): HTMLElement {
      return screen.getByRole("region", { name: "已禁用" });
    }


    /** The section's disclosure trigger — the rows below it are cards that also
     *  answer to the button role, so the trigger is named rather than "the
     *  button in there". */
    function parkedHeader(): HTMLElement {
      return within(parkedSection()).getByRole("button", { name: /已禁用/ });
    }

    /** The parked rows currently on screen — none while the section is folded,
     *  since folding unmounts the panel rather than hiding it. */
    function parkedRows(): HTMLElement[] {
      return within(parkedSection()).queryAllByRole("button", {
        name: /查看 .+ 详情/,
      });
    }

    /**
     * Unfolds the parked section, the way a reader reaches those rows. Idempotent
     * by design: the section's fold is the reader's own state, so a case that
     * sorts or unfolds first must not be flipped back by this helper.
     */
    async function revealParked(
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<void> {
      const header = parkedHeader();
      if (header.getAttribute("aria-expanded") === "false") {
        await user.click(header);
      }
      await waitFor(() =>
        expect(parkedHeader()).toHaveAttribute("aria-expanded", "true"),
      );
    }


    /** Every install except the two named ones, in the mock's own order. */
    const LIVE = ["pptx", "mcp-builder", "Code Review", "frontend-design"];
    /** The two installs these cases park: the newest and the second newest, so
     *  by install clock they are the two rows that would otherwise lead. */
    const PARKED = ["pdf", "docx"];

    /** The invariant, stated once: the live installs keep the head of the list,
     *  the parked ones the whole tail, and neither group borrows a row from the
     *  other. Written as a position claim rather than a full snapshot because
     *  that is the part every order shares — which rows lead is each order's own
     *  business, and is what the sort's own cases are for.
     *
     *  The parked half has to be unfolded to be read at all, so the helper does
     *  that first: the claim is about where the rows sit, not about the fold. */
    async function expectParkedBelowLive(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await revealParked(user);
      await waitFor(() => expect(rowNames()).toHaveLength(6));
      expect(rowNames().slice(0, LIVE.length)).toEqual(
        LIVE.map((name) => `查看 ${name} 详情`),
      );
      expect(rowNames().slice(LIVE.length)).toEqual(
        PARKED.map((name) => `查看 ${name} 详情`),
      );
    }

    beforeEach(() => {
      setMockSkillEnabled("pdf", false);
      setMockSkillEnabled("docx", false);
    });

    it("parks disabled installs below live installs, displays count, and toggles fold", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // starts folded
      expect(parkedHeader()).toHaveAttribute("aria-expanded", "false");
      expect(parkedHeader()).toHaveTextContent("2 个 skill");
      expect(parkedRows()).toHaveLength(0);

      // unfold
      await revealParked(user);
      expect(parkedRows()).toHaveLength(2);
      expect(rowNames()).toEqual([
        ...LIVE.map((name) => `查看 ${name} 详情`),
        ...PARKED.map((name) => `查看 ${name} 详情`),
      ]);

      // persists across sort change
      await pickSort(user, "安装时间");
      await expectParkedBelowLive(user);
    });

    it("draws no parked section while nothing is parked", async () => {
      setMockSkillEnabled("pdf", true);
      setMockSkillEnabled("docx", true);
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      expect(screen.queryByRole("region", { name: "已禁用" })).not.toBeInTheDocument();
      expect(rowNames()).toHaveLength(6);
    });

    it("keeps a parked skill in the drawer walk while its section is folded", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await pickSort(user, "安装时间");
      await waitFor(() => expect(parkedSection()).toBeInTheDocument());
      expect(parkedRows()).toHaveLength(0);

      await user.click(
        screen.getByRole("button", { name: "查看 frontend-design 详情" }),
      );
      const dialog = await screen.findByRole("dialog");
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(await within(dialog).findByText("pdf")).toBeInTheDocument();
    });
  });

  /**
   * The list's own question, asked from its own first row: what this machine
   * has, in the installed index's own relevance order, with the registry's
   * answer below it as a cheap supplement and skills.sh behind a press.
   */
  describe("the list's own search", () => {

    it("pre-fills the field from the ?skill= deep link", async () => {
      // Deep links like /installed?skill=<name> must land with that skill asked
      // for and consume the param.
      renderPage("/installed?skill=pdf");

      expect(await screen.findByLabelText("搜索 Skill")).toHaveValue("pdf");
      expect(await screen.findByText("pdf")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText("docx")).not.toBeInTheDocument(),
      );
    });

    it("filters skills by search text", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The debounce settles before the answer narrows.
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(1),
      );
      expect(screen.queryByText("docx")).not.toBeInTheDocument();

      await user.clear(screen.getByLabelText("搜索 Skill"));
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(6),
      );
    });

    it("shows a no-match empty state for a search with no results", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "zzz");

      expect(
        await screen.findByText(/本机、应用商店与 skills\.sh 都没有匹配/),
      ).toBeInTheDocument();
    });


    it("locks the sort control while searching", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");
      // The rows are the shape that has an order to lock: the cards have none.
      await pickUnit(user, "列表");
      expect(screen.getByRole("button", { name: "分组方式" })).toBeEnabled();

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The control would offer a choice the search answer does not honour, so it
      // says so where it stands — and unlocks when the question clears. It does
      // not leave the row: the field it stands beside would move under the
      // reader's cursor on every keystroke.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "分组方式" })).toBeDisabled(),
      );
      await user.clear(screen.getByLabelText("搜索 Skill"));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "分组方式" })).toBeEnabled(),
      );
    });

    it("keeps this list's question to itself, and out of the store's", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The two lists answer the same word from two different sources, so one
      // list's question never becomes the other's (see `lib/list-view`). The
      // field settles the word before asking (see `SearchInput`), so the
      // question is a moment behind the last keystroke.
      await waitFor(() =>
        expect(getListView().views.installed.query).toBe("pdf"),
      );
      expect(getListView().views.store).not.toHaveProperty("query");
    });
  });

  /**
   * A page switch unmounts the list and mounts it again, and the only thing
   * that answers for what the reader had made of it is the view memory (see
   * `useViewMemory`): the folds, the revealed depth and the scroll position
   * are the reader's rather than the visit's, so a page they return to is the
   * page they left. A differently-shaped answer restores nothing (the memory's
   * signature), and each case here starts from a memory the `beforeEach`
   * reset.
   */
  describe("the view a page switch returns to", () => {
    /** The six default installs plus twelve clock-less ones, so the reveal
     *  has more than its first chunk of rows to pace. */
    function seedExtraInstalls() {
      for (let i = 0; i < 12; i += 1) {
        addMockLocalSkill(`extra-${i}`);
      }
    }

    /** The page's own scrolling element (the list's, not the document's). */
    function pageScroller(): HTMLElement {
      return document.querySelector('div[class*="overflow-y-auto"]')!;
    }

    it("brings the revealed depth and the scroll position back with the page", async () => {
      seedExtraInstalls();
      const user = userEvent.setup();
      const first = renderPage();
      await pickUnit(user, "列表");
      // The first chunk is up (in whatever order the blend put the rows in).
      await screen.findAllByRole("listitem");

      // The reader reads to the end and scrolls somewhere mid-list.
      triggerReveal();
      triggerReveal();
      await waitFor(() =>
        expect(screen.getAllByRole("listitem")).toHaveLength(18),
      );
      const scroller = pageScroller();
      scroller.scrollTop = 240;
      fireEvent.scroll(scroller);

      // The switch away and back: this component is gone, and a fresh one
      // takes its place.
      first.unmount();
      renderPage();

      // The depth returns — the whole list mounts, not the first chunk — and
      // the reader is put back where they left.
      await waitFor(() =>
        expect(screen.getAllByRole("listitem")).toHaveLength(18),
      );
      await waitFor(() => expect(pageScroller().scrollTop).toBe(240));
    });

    it("brings a section's fold back with the page", async () => {
      seedExtraInstalls();
      const user = userEvent.setup();
      const first = renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");
      // The first chunk is up: the mock's extras carry today's clock, so the
      // fresh installs fill the 今天 section first.
      await screen.findByRole("region", { name: "今天" });

      // Read to the end, so every bucket has a section of its own.
      triggerReveal();
      triggerReveal();
      await waitFor(() =>
        expect(screen.getAllByRole("listitem")).toHaveLength(18),
      );

      // 最近 7 天 folds from its header: the row leaves the view, the header
      // and its count stay.
      await user.click(
        within(screen.getByRole("region", { name: "最近 7 天" })).getByRole(
          "button",
          { name: /最近 7 天/ },
        ),
      );
      expect(
        within(screen.getByRole("region", { name: "最近 7 天" })).queryByRole(
          "listitem",
        ),
      ).not.toBeInTheDocument();

      first.unmount();
      renderPage();
      await screen.findByRole("region", { name: "最近 7 天" });

      // Folded stays folded — and a section the reader never touched keeps
      // answering at its default, open.
      expect(
        within(screen.getByRole("region", { name: "最近 7 天" })).queryByRole(
          "listitem",
        ),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByRole("region", { name: "最近 30 天" })).getAllByRole(
          "listitem",
        ),
      ).toHaveLength(1);
    });

    it("keeps the parked section's fold, which starts folded", async () => {
      setMockSkillEnabled("pdf", false);
      const user = userEvent.setup();
      const first = renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // The parked half starts folded: the count on its header says there is
      // something set aside, and none of it shows.
      const parked = screen.getByRole("region", { name: "已禁用" });
      expect(
        within(parked).getByRole("button", { name: /已禁用/ }),
      ).toHaveAttribute("aria-expanded", "false");

      // The reader unfolds it; the fold is theirs, so it travels with the
      // page like every other fold.
      await user.click(within(parked).getByRole("button", { name: /已禁用/ }));
      expect(
        within(parked).getByRole("button", { name: /已禁用/ }),
      ).toHaveAttribute("aria-expanded", "true");

      first.unmount();
      renderPage();
      const parkedAgain = await screen.findByRole("region", {
        name: "已禁用",
      });
      expect(
        within(parkedAgain).getByRole("button", { name: /已禁用/ }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(within(parkedAgain).getAllByRole("listitem")).toHaveLength(1);
    });
  });
});
