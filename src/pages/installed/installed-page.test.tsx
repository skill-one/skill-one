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
  installMockSkill,
  resetMockAgentStatus,
  resetMockInstalledSkills,
  setMockSkillEnabled,
} from "../../lib/mock-local";
import { resetMockProvenance, seedMockProvenance } from "../../lib/provenance";
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
const { namesakeSkills, lookupSkills, getGroups, registrySnapshot, searchSkillsSh } =
  vi.hoisted(() => ({
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
): { name: string; kind?: string; repo?: string; repos?: string[] } | undefined {
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
 * 卡片 (one card per source repository). The pair stands on the row itself, so
 * this is one press on a named toggle and no popup to open.
 */
async function pickUnit(
  user: ReturnType<typeof userEvent.setup>,
  shape: "列表" | "卡片",
) {
  await user.click(screen.getByRole("button", { name: shape }));
}

/**
 * Picks an order for the rows: 热度 (the default, most-popular first), 安装时间
 * (newest first) or Token 占用 (heaviest description first). The control is
 * there for the row shape only — the cards are led by their repository's stars
 * and say so themselves.
 */
async function pickSort(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByRole("button", { name: "排序方式" }));
  await user.click(await screen.findByRole("menuitemradio", { name: label }));
}

/**
 * Picks a domain scope from the 分类 picker. `label` names the menu item —
 * 全部 or a domain's display label. The popup closes on the pick, so each
 * scope change reopens it.
 */
async function pickDomain(
  user: ReturnType<typeof userEvent.setup>,
  label: string | RegExp,
) {
  // The list renders its bar only once rows exist, so the trigger is waited
  // for rather than read off the first render.
  await user.click(await screen.findByRole("button", { name: "分类" }));
  await user.click(await screen.findByRole("menuitemradio", { name: label }));
}

/**
 * Opens the 分类 picker without picking, to read its menu of scopes; the
 * popup mounts asynchronously, so the caller's queries can be synchronous.
 */
async function openDomainSelect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "分类" }));
  await screen.findByRole("menuitemradio", { name: /^全部/ });
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
      const user = userEvent.setup();
      renderPage();

      // The browse bar leads with 全部: an install no store entry covers has no
      // classification either, and that is not the dataset's 其他 — nobody has
      // looked at it at all. The picker states the whole count, and its list
      // carries 未分类 and nothing for 其他.
      expect(
        await screen.findByRole("button", { name: "分类" }),
      ).toHaveTextContent("1");
      await openDomainSelect(user);
      expect(
        screen.getByRole("menuitemradio", { name: /^未分类/ }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("menuitemradio", { name: /^其他/ })).toBeNull();
      // No install has a recorded source, so every skill lives in one pool card:
      // six skills fit inside the folded cap, so the bar is a plain label and
      // every row is on screen.
      expect(await screen.findByText("本地安装")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /展开 本地安装/ }),
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
        screen.queryByRole("button", { name: /展开 本地安装/ }),
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
    it("offers one group switch per card, on when every skill is enabled", async () => {
      renderPage();

      // All six installs pool into one card: its bar carries the one switch that
      // governs them all, checked because the pool is fully enabled. Every row
      // fits the folded cap, and each carries its own hover-revealed switch
      // alongside it.
      const groupSwitch = await screen.findByRole("switch", {
        name: "全部关闭（本地安装）",
      });
      expect(groupSwitch).toHaveAttribute("aria-checked", "true");
      expect(screen.getAllByRole("switch")).toHaveLength(7);
    });

    it("disables every skill of a card with one press, and re-enables them", async () => {
      const user = userEvent.setup();
      const { container } = renderPage();

      await user.click(
        await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
      );

      // The whole pool is now off: the visible rows dim together and the bar's
      // own switch flips, including for the three skills past the preview cap that
      // the backend write still covers (the card re-reads the same records).
      const off = await screen.findByRole("switch", {
        name: "全部开启（本地安装）",
      });
      expect(off).toHaveAttribute("aria-checked", "false");
      const rows = container.querySelectorAll("[data-skill]");
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => expect(row).toHaveClass("opacity-60"));

      await user.click(off);
      expect(
        await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
      ).toHaveAttribute("aria-checked", "true");
      rows.forEach((row) => expect(row).not.toHaveClass("opacity-60"));
    });

    it("shows a card with one disabled skill as a half-on switch", async () => {
      // One skill parked in the backend's disabled dir: the card is neither all
      // on nor all off, so its switch reads as the half state rather than
      // pretending the group is simply off.
      setMockSkillEnabled("pdf", false);
      renderPage();

      const groupSwitch = await screen.findByRole("switch", {
        name: "全部开启（本地安装）",
      });
      expect(groupSwitch).toHaveAttribute("aria-checked", "false");
      expect(groupSwitch).toHaveClass("data-unchecked:bg-primary/40!");
    });

    it("enables every skill of a half-on card with one press", async () => {
      const user = userEvent.setup();
      setMockSkillEnabled("pdf", false);
      const { container } = renderPage();

      await user.click(
        await screen.findByRole("switch", { name: "全部开启（本地安装）" }),
      );

      // Enable-all-first: the previously disabled skill joins the rest, its row
      // un-dims, and the group reaches the fully-on state in one press.
      expect(
        await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
      ).toHaveAttribute("aria-checked", "true");
      const row = container.querySelector('[data-skill="pdf"]');
      expect(row).not.toHaveClass("opacity-60");
    });

    it("carries a hover-revealed switch on each installed row", async () => {
      const { container } = renderPage();

      await screen.findByRole("switch", { name: "全部关闭（本地安装）" });

      // Every row now owns its enable switch in the card's floating hover slot
      // (the store's install button takes the same slot), while the bar's group
      // switch stays the one control that answers "all of them at once".
      const row = container.querySelector('[data-skill="pdf"]');
      expect(row).not.toBeNull();
      const rowSwitch = row?.querySelector('[role="switch"]');
      expect(rowSwitch).not.toBeNull();
      expect(rowSwitch).toHaveAttribute("aria-checked", "true");
    });

    it("keeps a disabled skill's switch on screen without the pointer", async () => {
      // A disabled skill is a fact, not an invitation: the dimmed row needs its
      // remedy visible, so its unchecked switch joins the always-on rule beside
      // the store's installed badge — the wrapper keeps the rule and the switch
      // renders the state the rule reads. An enabled switch stays
      // hover-revealed, so a healthy card stays a list rather than a control row.
      setMockSkillEnabled("pdf", false);
      const { container } = renderPage();

      await screen.findByRole("switch", { name: "全部开启（本地安装）" });
      const row = container.querySelector('[data-skill="pdf"]');
      const wrapper = row?.querySelector("span.absolute");
      expect(wrapper).toHaveClass("has-data-unchecked:opacity-100");
      const rowSwitch = row?.querySelector('[role="switch"]');
      // The Base UI switch carries its state as a boolean attribute — exactly
      // what the wrapper's always-on rule reads.
      expect(rowSwitch).toHaveAttribute("data-unchecked");
      expect(rowSwitch).toHaveAttribute("aria-checked", "false");
    });

    it("dims a disabled row behind the bar's group switch", async () => {
      // The dimmed row is the evidence the group switch's half state explains.
      setMockSkillEnabled("pdf", false);
      const { container } = renderPage();

      await screen.findByRole("switch", { name: "全部开启（本地安装）" });
      const row = container.querySelector('[data-skill="pdf"]');
      expect(row).toHaveClass("opacity-60");
    });

    it("scopes each card's switch to that card's own skills", async () => {
      const user = userEvent.setup();
      // pdf carries a recorded source and moves into its own repository card;
      // the other five stay pooled under 本地安装.
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      const { container } = renderPage();

      const repoSwitch = await screen.findByRole("switch", {
        name: "全部关闭（anthropics/skills）",
      });
      const poolSwitch = screen.getByRole("switch", {
        name: "全部关闭（本地安装）",
      });
      // Two bars, plus every row's own switch (5 pool rows, 1 repo row — all
      // six fixtures fit the folded cap).
      expect(screen.getAllByRole("switch")).toHaveLength(8);

      await user.click(repoSwitch);

      // Only the repository's one skill goes off: its row dims and only its bar
      // switch flips, while the pool's five stay enabled behind a checked switch.
      expect(
        await screen.findByRole("switch", {
          name: "全部开启（anthropics/skills）",
        }),
      ).toHaveAttribute("aria-checked", "false");
      expect(poolSwitch).toHaveAttribute("aria-checked", "true");
      expect(container.querySelector('[data-skill="pdf"]')).toHaveClass(
        "opacity-60",
      );
      expect(container.querySelector('[data-skill="docx"]')).not.toHaveClass(
        "opacity-60",
      );
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
      // directory and labels the skill 本地安装.
      expect(within(dialog).getByText("pdf")).toBeInTheDocument();
      expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
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

    it("labels a no-source skill's drawer as 本地安装 without repo links", async () => {
      const user = userEvent.setup();
      addMockLocalSkill("my-local");
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: "查看 my-local 详情" }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
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
      expect(within(dialog).queryByText("本地安装")).not.toBeInTheDocument();

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
      expect(await within(dialog).findByText("本地安装")).toBeInTheDocument();
    }, 20_000);

    it("does not open the drawer or the door from the bar's switch", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await user.click(
        await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
      );
      // The switch is a sibling of the bar's toggle, not a child: the press
      // toggles the group without opening the drawer. Six skills fit the folded
      // cap, so the bar is a plain label here — there is no door to open.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /展开 本地安装/ }),
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

    it("names a source-less install as 本地安装 and draws no owner face", async () => {
      const { container } = renderPage();

      await screen.findByText("pdf");
      // Every install here is tool-installed (no ledger entry), so the one card's
      // bar states that in place of a repository, and no owner face joins it.
      const bars = container.querySelectorAll('[data-slot="card-header"]');
      expect(bars).toHaveLength(1);
      expect(bars[0]).toHaveTextContent("本地安装");
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
      for (const bar of container.querySelectorAll('[data-slot="card-header"]')) {
        expect(bar).not.toHaveTextContent(/个 skill/);
      }
      // The other five keep the pool card, whose bar names no repository.
      expect(screen.getAllByText("本地安装")).toHaveLength(1);
      // Only the sourced card can name an owner, so it carries the only face.
      expect(container.querySelectorAll('ul [data-slot="avatar"]')).toHaveLength(
        1,
      );
    });

    it("links a sourced skill's detail drawer to its repo instead of 本地安装", async () => {
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
      // the bare 本地安装 label.
      expect(within(dialog).getByText("anthropics/skills")).toBeInTheDocument();
      expect(within(dialog).queryByText("本地安装")).not.toBeInTheDocument();
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
      await user.click(within(dialog).getByRole("switch", { name: "关闭 pdf" }));
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

      // The resolved entry is what classifies the install, so an item for its
      // domain joins the picker's list — and the card's bar prints the
      // repository's stars, the same figure the store's own cards carry.
      await openDomainSelect(user);
      expect(
        screen.getByRole("menuitemradio", { name: /^内容创作/ }),
      ).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.getByTitle("169600 stars")).toBeInTheDocument();

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

  describe("scoping and ordering", () => {
    it("scopes the list to a classification from the picker", async () => {
      const user = userEvent.setup();
      seedMockProvenance({ pdf: { repo: "anthropics/skills" } });
      // The registry still lists the source the ledger recorded, so pdf wears a
      // store classification and a chip for it joins the filter bar.
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

      await pickDomain(user, /^内容创作/);

      // The scope leaves only the classified skill on screen...
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(1),
      );
      expect(
        screen.getByRole("button", { name: "查看 pdf 详情" }),
      ).toBeInTheDocument();

      // ...and 全部 clears the scope again.
      await pickDomain(user, /^全部/);
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(6),
      );
    });

    // The repository unit (the default): one card per source, the cards ordered
    // by each card's newest install.

    /** The cards in list order, named by the repository each one stands for
     *  (the pool card, which has no repository, names itself). The cards render
     *  inside the sheet's portal, so the caller hands in the render's
     *  `baseElement` — the only handle that reaches them. */
    function cardBarNames(scope: ParentNode): string[] {
      return Array.from(
        scope.querySelectorAll('[data-slot="card"][data-repo]'),
      ).map((card) => card.getAttribute("data-repo") || "本地安装");
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
        "本地安装",
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
      expect(cardBarNames(baseElement)).toEqual(["acme/tools", "本地安装"]);

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
      expect(screen.getByRole("button", { name: "卡片" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        screen.queryByRole("button", { name: "排序方式" }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(cardBarNames(baseElement)).toEqual([
          "zoo/a",
          "zoo/b",
          "本地安装",
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
      expect(screen.queryByRole("link", { name: /^查看本地安装/ })).toBeNull();
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

    it("orders the skill unit by token cost and states each row's estimate", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await pickUnit(user, "列表");
      await pickSort(user, "Token 占用");

      // The estimate is a local fact — the description's own cost, no store
      // entry needed — so every row with a description states one, as a bare
      // figure under the coin icon. The short hint is matched exactly: jsdom
      // never runs the sort select's closing animation, so its content stays
      // mounted, and a substring of "Token" would match the select's own text
      // through it.
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });
      const estimates = screen
        .getAllByLabelText("Skill 英文描述的预估 Token 数")
        .map((node) => node.textContent ?? "");

      // The order is the estimate's own: heaviest first, non-increasing down
      // the list (pdf's long description leads the mock installs).
      const figures = estimates.map(Number);
      expect(figures.length).toBeGreaterThanOrEqual(5);
      expect(figures[0]).toBeGreaterThan(figures[1]);
      for (let i = 0; i < figures.length - 1; i += 1) {
        expect(figures[i]).toBeGreaterThanOrEqual(figures[i + 1]);
      }

      // Picking 热度 re-answers the list and its slots together: the estimates
      // leave with the ordering they belonged to. (No store entry resolves
      // here, so the rows state no blend either.)
      setSort("installed", "popularity");
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });
      expect(
        screen.queryByLabelText("Skill 英文描述的预估 Token 数"),
      ).toBeNull();
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
      expect(screen.getByRole("button", { name: "排序方式" })).toHaveTextContent(
        "热度",
      );

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

  describe("counts in the skill unit", () => {
    it("counts skills rather than repositories in the skill unit's chips", async () => {
      const user = userEvent.setup();
      seedMockProvenance({
        pdf: { repo: "anthropics/skills" },
        docx: { repo: "anthropics/skills" },
      });
      seedStoreEntries({ pdf: 2991984, docx: 1991984 }, "content-creation");
      renderPage();

      // The repository unit weighs a domain by repositories: one source holds
      // both classified installs, so 内容创作 counts 1 beside 全部's 2 cards.
      // The figures arrive with the store's lookup, so the trigger is waited
      // out before the select is read.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "分类" })).toHaveTextContent(
          "2",
        ),
      );
      await openDomainSelect(user);
      expect(
        screen.getByRole("menuitemradio", { name: /^内容创作/ }),
      ).toHaveTextContent("1");
      expect(
        screen.getByRole("menuitemradio", { name: /^全部/ }),
      ).toHaveTextContent("2");
      await user.keyboard("{Escape}");

      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");

      // The same domain now weighs skills, and 全部 every install.
      await openDomainSelect(user);
      expect(
        screen.getByRole("menuitemradio", { name: /^内容创作/ }),
      ).toHaveTextContent("2");
      expect(screen.getByRole("menuitemradio", { name: /^全部/ })).toHaveTextContent(
        "6",
      );

      // Scoping keeps the skills that belong to the domain, whoever they share a
      // source with: each keeps its own row.
      await user.click(screen.getByRole("menuitemradio", { name: /^内容创作/ }));
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(2),
      );

      // Back in the repository unit, 全部 counts cards again.
      await pickUnit(user, "卡片");
      await openDomainSelect(user);
      expect(screen.getByRole("menuitemradio", { name: /^全部/ })).toHaveTextContent(
        "2",
      );
    });

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

      // 按安装时间 reads as a timeline, so this is where a medal is most easily
      // over-read as a weight. The list is content to call its own order a ranking
      // anyway: the reader picked the order, and the number states a place in
      // exactly that. Its own case, so relaxing one comparator cannot quietly
      // relax the claim for the others.
      await pickSort(user, "安装时间");
      await waitFor(() => expect(podium(0)).toContain(MEDAL_CLASSES[0]));
      expect(podium(1)).toContain(MEDAL_CLASSES[1]);
      expect(podium(2)).toContain(MEDAL_CLASSES[2]);
    });

    it("still colours them under the token cost", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // And the third order, which weighs the description rather than the skill.
      // Same claim, restated, for the same reason.
      await pickSort(user, "Token 占用");
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

      await pickUnit(user, "卡片");
      await waitFor(() =>
        expect(
          document.querySelector('[data-slot="card-header"]')!.firstElementChild!
            .firstElementChild!.className,
        ).toBe(rowInk),
      );
    });
  });

  /**
   * The one thing about the skill unit's order the reader does not get to pick:
   * a disabled install is parked below every live one, in a section of its own,
   * under all three orders alike. Enablement is not a fourth order — it is a
   * partition of whichever order was chosen — so the tests below hold the
   * *relative* claim ("no parked row above a live row") rather than a snapshot of
   * one order, and pin the concrete order only where it is knowable up front.
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

    /** The live group: the bare list the page draws above that section. Nothing
     *  wraps those rows — they are the list itself — so it is found as "the list
     *  that is not inside a section" rather than by position, which would change
     *  the moment the parked section is unfolded. */
    function liveList(): HTMLElement {
      const list = screen.getAllByRole("list").find((ul) => !ul.closest("section"));
      if (!list) throw new Error("the live list is not on screen");
      return list;
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

    /** The ordinal each row prints, in the same document order as `rowNames`. */
    function rowOrdinalsIn(scope: ParentNode): string[] {
      return Array.from(scope.querySelectorAll("li span.w-6")).map(
        (span) => span.textContent ?? "",
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

    it("parks the disabled installs below the live ones under every order", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");

      // The default order, and the case that shows the invariant is not merely
      // "the disabled rows happen to be last": the two parked installs are the
      // two *newest*, so by install clock — and, with no store figures seeded,
      // by the popularity fallback too — they are the two rows that would lead
      // the list. They read fourth and fifth instead.
      await screen.findByText("frontend-design");
      await revealParked(user);
      expect(rowNames()).toEqual([
        ...LIVE.map((name) => `查看 ${name} 详情`),
        ...PARKED.map((name) => `查看 ${name} 详情`),
      ]);

      await pickSort(user, "安装时间");
      await expectParkedBelowLive(user);
    });

    it("parks them just the same under the popularity blend", async () => {
      // The same claim under the order the list opens in, restated so a change
      // to one order's comparator cannot quietly undo the invariant.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      await expectParkedBelowLive(user);
    });

    it("parks them just the same under the token order", async () => {
      // And under the third. The invariant is a property of the pipeline, so the
      // assertion that matters is the relative one and it has to hold for an
      // order nobody wrote a case for — which is why each order gets its own
      // short case rather than one case looping over all three.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      await pickSort(user, "Token 占用");
      await expectParkedBelowLive(user);
    });

    it("holds each group to the order the reader picked", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // 按安装时间, newest first. The parked section is ordered by the same
      // clock as the live list — parking a skill does not cost it its place
      // among the other parked ones, which is the whole reason the split runs
      // after the sort rather than replacing it.
      await pickSort(user, "安装时间");
      await revealParked(user);
      await waitFor(() => expect(parkedRows()).toHaveLength(2));
      expect(rowNames()).toEqual([
        ...LIVE.map((name) => `查看 ${name} 详情`),
        ...PARKED.map((name) => `查看 ${name} 详情`),
      ]);
    });

    it("numbers each group from one, so neither half carries the other's gaps", async () => {
      // The parked half is a section of its own, so it is numbered as the list
      // it is rather than continuing the live list above it. The flat order
      // interleaves the two groups rather than laying them end to end, and under
      // this sort the two parked installs are the two newest — the rows that
      // would otherwise lead. Counting across the split would therefore leave
      // the live list carrying 3…6 and hand the parked section the 1 and 2 it
      // gave up: a run that jumps from 4 back to 1 reads as one list with rows
      // gone missing rather than as a list and a section below it.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await pickSort(user, "安装时间");
      await revealParked(user);

      await waitFor(() =>
        expect(rowOrdinalsIn(liveList())).toEqual(["1", "2", "3", "4"]),
      );
      expect(rowOrdinalsIn(parkedSection())).toEqual(["1", "2"]);
      // And in document order the run restarts at the section, so the claim does
      // not rest on which section a row happened to be found in.
      expect(rowOrdinalsIn(document.body)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "1",
        "2",
      ]);
    });

    it("leaves the live group's own run gapless under the default order too", async () => {
      // The same claim under the order the list opens in, restated so a change to
      // one order's comparator cannot quietly reintroduce the gaps. Here the two
      // parked installs are not the two that lead the flat order, so counting
      // across the split would have handed the parked group the 1 and the 3 and
      // left holes in the live group's numbers — the exact shape this forbids.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await revealParked(user);

      expect(rowOrdinalsIn(liveList())).toEqual(["1", "2", "3", "4"]);
      expect(rowOrdinalsIn(parkedSection())).toEqual(["1", "2"]);
    });

    it("keeps a row's number still as the reveal grows", async () => {
      // The count runs over the *revealed* rows, so it must be a count a growing
      // prefix cannot renumber under the reader. The split is what guarantees it:
      // each half keeps the order it arrived in (`splitByEnabled`, pinned by
      // "keeps each half in the order it arrived in"), so the revealed rows are
      // a prefix of the whole group and a row numbered 2 while three rows are
      // revealed is still numbered 2 when the fourth arrives. The mock's six
      // installs all mount in the first chunk, so the property is asserted where
      // it is decided rather than staged through the observer here.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await revealParked(user);

      // Whatever is revealed is numbered as a plain run from 1 — no gaps, and no
      // dependence on rows that are not mounted yet.
      for (const group of [liveList(), parkedSection()]) {
        expect(rowOrdinalsIn(group)).toEqual(
          Array.from(
            { length: group.querySelectorAll("li").length },
            (_, i) => String(i + 1),
          ),
        );
      }
    });

    it("states the parked count on the section's own header", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      // The badge rides the header whether or not the section is open, so a
      // folded section still says how much it holds.
      expect(parkedHeader()).toHaveTextContent("已禁用");
      expect(parkedHeader()).toHaveTextContent("2 个 skill");
    });

    it("wraps only the parked half in a section, leaving the live rows a bare list", async () => {
      // The live rows are the page's list, so nothing is named over them: a
      // header reading 「已启用」 would label the answer with the very subject it
      // answers, and a section around it would add a landmark and a fold to a
      // list a reader never asked to put away. The parked half keeps its header
      // because it is a group *below* the list, and the count on it is what says
      // there is anything to see.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await revealParked(user);

      expect(
        screen.queryByRole("region", { name: "已启用" }),
      ).not.toBeInTheDocument();
      expect(liveList().closest("section")).toBeNull();
      // The parked half is the one that is named, and it states its own size.
      expect(parkedSection()).toBeInTheDocument();
      expect(parkedHeader()).toHaveTextContent("2 个 skill");
      // The hairline leads the section, which is the only group that has one.
      expect(parkedSection()).toHaveClass("border-t");
      // Each half holds its own rows, and the split still partitions rather than
      // re-orders: live leads the document, parked follows it.
      expect(rowNames().slice(0, LIVE.length)).toEqual(
        LIVE.map((name) => `查看 ${name} 详情`),
      );
      expect(rowNames().slice(LIVE.length)).toEqual(
        PARKED.map((name) => `查看 ${name} 详情`),
      );
    });

    it("starts the parked section folded, so the page lands on the live list alone", async () => {
      // The parked half is by definition what the reader set aside, so it opens
      // folded: the page on arrival is the live list, and the header's badge is
      // the whole of what says there is more below it.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      expect(parkedHeader()).toHaveAttribute("aria-expanded", "false");
      expect(parkedRows()).toHaveLength(0);
      expect(rowNames()).toEqual(LIVE.map((name) => `查看 ${name} 详情`));
      expect(parkedHeader()).toHaveTextContent("2 个 skill");
    });

    it("folds the parked rows away and back without losing them", async () => {
      // The fold is the reader's, in both directions, and touches nothing else:
      // the live list above is never hidden with it.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      expect(parkedRows()).toHaveLength(0);
      await user.click(parkedHeader());
      await waitFor(() => expect(parkedRows()).toHaveLength(2));
      expect(rowNames()).toHaveLength(6);

      await user.click(parkedHeader());
      await waitFor(() => expect(parkedRows()).toHaveLength(0));
      // The live list is untouched by the fold — only the parked half was ever
      // hidden.
      expect(rowNames()).toEqual(LIVE.map((name) => `查看 ${name} 详情`));
    });

    it("keeps the reader's fold across a change of order", async () => {
      // The fold is not keyed by the answer: re-ordering or narrowing the list
      // neither opens nor closes it, because a reader who put their parked
      // skills away means it for the answer, not for one order of it.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await revealParked(user);

      await pickSort(user, "安装时间");
      await waitFor(() =>
        expect(parkedHeader()).toHaveAttribute("aria-expanded", "true"),
      );
      expect(parkedRows()).toHaveLength(2);

      await user.click(parkedHeader());
      await pickSort(user, "Token 占用");
      await waitFor(() =>
        expect(parkedHeader()).toHaveAttribute("aria-expanded", "false"),
      );
    });

    it("draws no section at all while nothing is parked", async () => {
      // An absent section reads quieter than a zero: with every install live the
      // list is exactly the list this page always drew. The two installs this
      // group parks are handed back, since a list with nothing parked is the
      // only state in which the section must not appear — and with it the last
      // trace of a group header over the live rows.
      setMockSkillEnabled("pdf", true);
      setMockSkillEnabled("docx", true);
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");

      expect(
        screen.queryByRole("region", { name: "已禁用" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "已启用" }),
      ).not.toBeInTheDocument();
      // One list, unwrapped: all six rows sit in the same bare list, so nothing
      // is wrapped around them either way.
      expect(rowNames()).toHaveLength(6);
      const lists = new Set(
        screen
          .getAllByRole("button", { name: /查看 .+ 详情/ })
          .map((row) => row.closest("ul")),
      );
      expect(lists.size).toBe(1);
      expect(liveList().closest("section")).toBeNull();
    });

    it("keeps a parked skill in the drawer's walk while its section is folded", async () => {
      // Folding hides content visually only, and it is the state the page opens
      // in, so the drawer has to work from the folded answer. It walks the whole
      // answer rather than the mounted prefix, so a folded skill is still
      // reachable — which is what lets a reader turn one back on without
      // unfolding the section first.
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await screen.findByText("frontend-design");
      await pickSort(user, "安装时间");
      await waitFor(() => expect(parkedSection()).toBeInTheDocument());
      // Folded, and holding nothing: the state a reader actually meets.
      expect(parkedRows()).toHaveLength(0);

      // Opened from the last live row, so the walk's next step is the question:
      // the first parked one, not a skill drawn far above this one. The drawer
      // reads the split order for exactly this reason.
      await user.click(
        screen.getByRole("button", { name: "查看 frontend-design 详情" }),
      );
      const dialog = await screen.findByRole("dialog");
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(await within(dialog).findByText("pdf")).toBeInTheDocument();
    });

    it("leaves the repository unit alone", async () => {
      // A card is a repository, its rows are what the bar's group switch acts
      // on, and a half-on card is a fact the card exists to state. Parking a
      // skill per-row inside a card would split the very rows one press has to
      // act on together, so the invariant is deliberately scoped to the skill
      // shape.
      renderPage();

      await screen.findByText("本地安装");
      expect(
        screen.queryByRole("region", { name: "已禁用" }),
      ).not.toBeInTheDocument();
      // The pool card still lists both parked installs, dimmed but present.
      expect(
        within(
          screen.getByRole("button", { name: "查看 pdf 详情" }).closest("li")!,
        ).getByText("pdf"),
      ).toBeInTheDocument();
    });
  });

  /**
   * The list's own question, asked from its own first row: what this machine
   * has, in the installed index's own relevance order, with the registry's
   * answer below it as a cheap supplement and skills.sh behind a press.
   */
  describe("the list's own search", () => {
    /**
     * The store's grouped answer to a search for `name`: one repository
     * carrying one skill of that name under a recorded source — a namesake of
     * what the machine has installed, which is what an installed search's store
     * section is for.
     */
    function storeAnswerFor(name: string) {
      return {
        groups: [
          {
            key: "acme/skills",
            title: "acme/skills",
            stars: 12,
            skills: [
              {
                skill: {
                  id: `acme/skills/${name}`,
                  name,
                  repo: "acme/skills",
                  description: "PDF 文档读取、生成、合并、拆分与标注。",
                  stars: 12,
                  downloads: 30,
                },
                matched: { name: [name] },
              },
            ],
          },
        ],
        total: 1,
      };
    }

    /** The four installs the one-source cases gather into one source. */
    const RUN_SOURCE = ["pdf", "docx", "pptx", "mcp-builder"];

    /** Records one source for every name of the set. */
    function seedRunSource(repo = "acme/tools") {
      seedMockProvenance(
        Object.fromEntries(RUN_SOURCE.map((name) => [name, { repo }])),
      );
    }

    it("pre-fills the field from the ?skill= deep link", async () => {
      // The menu bar popover deep links to /installed?skill=<name>; the page
      // must land with that skill asked for and consume the param.
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

    it("highlights matched terms on a searched card, like the store's list", async () => {
      const user = userEvent.setup();
      const { container } = renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The installed list's index reports matched terms per field exactly as
      // the registry's worker does, so the shared card marks them the same way.
      await waitFor(() =>
        expect(container.querySelector("mark")).toHaveTextContent("pdf"),
      );
    });

    it("renders no marks outside a search", async () => {
      const { container } = renderPage();

      await screen.findByText("pdf");
      expect(container.querySelector("mark")).toBeNull();
    });

    it("searches Chinese text but not a fragment inside a word", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      // The descriptions here are Chinese and carry no word separators; the
      // shared index splits Han text into character bigrams, so a phrase still
      // answers — pdf (「PDF 文档读取…」) and docx (「…Word 文档。」).
      await user.type(screen.getByLabelText("搜索 Skill"), "文档");
      expect(await screen.findByText("pdf")).toBeInTheDocument();
      expect(screen.getByText("docx")).toBeInTheDocument();

      // "df" sits inside the term "pdf": the substring filter used to answer it,
      // a term index does not. Every source has now answered empty, so the empty
      // state speaks for the whole search rather than for this machine alone.
      await user.clear(screen.getByLabelText("搜索 Skill"));
      await user.type(screen.getByLabelText("搜索 Skill"), "df");
      expect(
        await screen.findByText(/本机、应用商店与 skills\.sh 都没有匹配/),
      ).toBeInTheDocument();
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

    it("answers with this machine's installs, the store below, and skills.sh last", async () => {
      const user = userEvent.setup();
      // The store's index answers this query too — cheap and certain, so it is
      // simply there below the installed answer.
      getGroups.mockResolvedValue(storeAnswerFor("pdf"));
      renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The installed answer leads, in the installed index's own relevance
      // order: docx does not match. (Waited out: until the query settles, the
      // browse list behind it still holds docx, and the answer has no section
      // of its own that could scope the assertion.)
      await waitFor(() => expect(screen.queryByText("docx")).toBeNull());
      expect(screen.getByText("pdf")).toBeInTheDocument();
      // The own group now carries the source's name and count, like every other
      // group: three sources answer one question, and the reader is told which
      // is which.
      const own = await screen.findByRole("region", { name: "已安装" });
      expect(within(own).getByText("1 个仓库")).toBeInTheDocument();
      // The store's index is cheap and certain, so its answer is simply there
      // below the installed one — a titled group, open by default, counted.
      const store = await screen.findByRole("region", { name: "应用商店" });
      expect(within(store).getByText("1 个仓库")).toBeInTheDocument();
      // The order is trust and cost: what this machine has leads, the daily
      // snapshot follows, and skills.sh's reach — asked below — would come last.
      expect(
        own.compareDocumentPosition(store) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // The live source has nothing to add, so it is absent rather than open
      // and zero — an absent group reads quieter than a header over nothing.
      expect(
        screen.queryByRole("region", { name: "skills.sh 官方搜索" }),
      ).not.toBeInTheDocument();
      // It was still asked: one query, one request, and its empty answer is
      // what let the empty state speak.
      expect(searchSkillsSh).toHaveBeenCalledWith("pdf", expect.anything());
    });

    it("lets the live source carry the answer when this machine has none", async () => {
      const user = userEvent.setup();
      // skills.sh holds the one skill the installed index cannot find.
      searchSkillsSh.mockResolvedValue([
        {
          name: "pdf",
          id: "acme/pdfs/pdf",
          repo: "acme/pdfs",
          description: "",
          stars: 0,
          downloads: 42,
          url: "https://www.skills.sh/acme/pdfs/pdf",
          storeBacked: false,
        },
      ]);
      renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "nomatch");

      // Nothing here and nothing in the store matched, so the whole-search
      // empty state has not earned the right to speak — a page that says "no
      // matches" above a full page of results is lying about its own contents.
      expect(
        screen.queryByText(/本机、应用商店与 skills\.sh 都没有匹配/),
      ).not.toBeInTheDocument();
      // The empty groups are absent; the live one is the whole answer, and it
      // says which source it is.
      expect(
        screen.queryByRole("region", { name: "已安装" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "应用商店" }),
      ).not.toBeInTheDocument();
      const live = await screen.findByRole("region", {
        name: "skills.sh 官方搜索",
      });
      // **The scope change is stated, not left to be noticed.** The reader
      // searched 「已安装」; rows under no 「已安装」 header would read as
      // installs until they looked up and found another source's name. So the
      // own source leaves one quiet line in the slot its group would have held,
      // and the line is not a header over an empty panel — it is a sentence.
      const note = screen.getByText("本机没有匹配“nomatch”的 Skill");
      expect(note).toBeInTheDocument();
      expect(
        note.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // It is **centred** in the answer column, as one unit with its glyph —
      // `pl-6` would put half of itself inside the centring and land the line
      // 12px right of true centre, which reads as "almost centred" rather than
      // as either. The class is the claim here: jsdom lays nothing out, so
      // centring is pinned by what asks for it rather than by a measurement.
      expect(note).toHaveClass("justify-center");
      expect(note.className).not.toContain("pl-");
      // The glyph is what still names the scope, so it travels with the
      // sentence rather than being left behind at the column edge.
      expect(note.querySelector("svg")).not.toBeNull();
    });

    it("stands the quiet scope line down when the whole search found nothing", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");

      await user.type(screen.getByLabelText("搜索 Skill"), "zzz");

      // Every source answered empty, so the one sentence that speaks for all of
      // them is enough; a second line about this machine alone would be the same
      // fact said twice.
      expect(
        await screen.findByText(/本机、应用商店与 skills\.sh 都没有匹配/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("本机没有匹配“zzz”的 Skill"),
      ).not.toBeInTheDocument();
    });

    it("opens the installed surface's own drawer from a searched row", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");
      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
      await waitFor(() => expect(screen.queryByText("docx")).toBeNull());
      await pickUnit(user, "列表");

      // The install the row carries is what this list manages, so the drawer it
      // opens wears the installed surface: no store install CTA — the skill is
      // already home, and the panel says so with the switch, not with a button.
      await user.click(await screen.findByRole("button", { name: "查看 pdf 详情" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog")).queryByRole("button", { name: /安装/ }),
      ).not.toBeInTheDocument();
    });

    it("brings the store's answer in a default-open section, each row in its own surface", async () => {
      const user = userEvent.setup();
      // The store's index answers the same query with a namesake of an installed
      // skill — the same name under a recorded source, which is exactly what the
      // section below is for.
      getGroups.mockResolvedValue(storeAnswerFor("pdf"));
      renderPage();
      await screen.findByText("pdf");
      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
      await waitFor(() => expect(screen.queryByText("docx")).toBeNull());
      await pickUnit(user, "列表");

      // Asked for nothing: the registry's index is already in memory, so its
      // answer is on screen under the installed one, with a count, open.
      const store = await screen.findByRole("region", { name: "应用商店" });
      expect(within(store).getByText("1 个 skill")).toBeInTheDocument();
      // Two answers, two rows of the same name — the install above, the store
      // entry below it.
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: "查看 pdf 详情" }),
        ).toHaveLength(2),
      );
      // The store row wears the store's surface: the install CTA the installed
      // surface never offers.
      await user.click(screen.getAllByRole("button", { name: "查看 pdf 详情" })[1]);
      expect(
        await within(await screen.findByRole("dialog")).findByRole("button", {
          name: "已安装",
        }),
      ).toBeInTheDocument();
    });

    it("keeps the answer in relevance order while the sort is popularity", async () => {
      const user = userEvent.setup();
      seedRunSource();
      seedStoreEntries({ docx: 50, pdf: 30, pptx: 20, "mcp-builder": 5 });
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "热度");
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ });

      // A search re-answers the list by relevance — the better ranking while a
      // question is live — so the sort stands down rather than re-ranking hits.
      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
      await waitFor(() =>
        expect(
          screen
            .getAllByRole("button", { name: /查看 .+ 详情/ })
            .map((node) => node.getAttribute("aria-label")),
        ).toEqual(["查看 pdf 详情"]),
      );
    });

    it("answers with rows in the skill unit", async () => {
      const user = userEvent.setup();
      renderPage();
      await pickUnit(user, "列表");
      await pickSort(user, "安装时间");

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The match comes back as a row rather than a card, and as the only row: a
      // search re-answers the list by relevance in either unit.
      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(1),
      );
      expect(
        screen.getByRole("button", { name: "查看 pdf 详情" }),
      ).toBeInTheDocument();
    });

    it("locks the sort control while searching, like the picker", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");
      // The rows are the shape that has an order to lock: the cards have none.
      await pickUnit(user, "列表");
      expect(screen.getByRole("button", { name: "排序方式" })).toBeEnabled();

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // The control would offer a choice the search answer does not honour, so it
      // says so where it stands — and unlocks when the question clears. It does
      // not leave the row: the field it stands beside would move under the
      // reader's cursor on every keystroke.
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "排序方式" }),
        ).toBeDisabled(),
      );
      await user.clear(screen.getByLabelText("搜索 Skill"));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "排序方式" })).toBeEnabled(),
      );
    });

    it("locks the category picker while searching", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("pdf");
      expect(screen.getByRole("button", { name: "分类" })).toBeEnabled();

      await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

      // A search re-orders the list by relevance and ignores the scope, so the
      // picker says so where it stands — exactly as it does in the store — and
      // the row keeps its shape while the field is being typed into.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "分类" })).toBeDisabled(),
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
  });