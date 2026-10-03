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
import { setSort, setUnit } from "../../lib/list-view";

configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates and the
// page looks up the store entries behind recorded sources; both mocks answer
// "nothing found" by default so the worker-less test env stays silent.
const { searchSkills, lookupSkills, getGroups, registrySnapshot, searchSkillsSh } =
  vi.hoisted(() => ({
    searchSkills: vi.fn(),
    lookupSkills: vi.fn(),
    getGroups: vi.fn(),
    // One stable object: the page reads it through useSyncExternalStore, which
    // treats a fresh snapshot on every call as an infinite render loop.
    registrySnapshot: { ready: true, epoch: 1 },
    searchSkillsSh: vi.fn(),
  }));
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills,
  getGroups,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

/**
 * The live skills.sh search is stubbed at the module boundary so the installed
 * list can be held to never asking it: an installed search answers from this
 * machine's own records, so the store's two remote sources stand down with
 * their sections. `isSearchableQuery` stays real.
 */
vi.mock("../../lib/skills-sh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/skills-sh")>()),
  searchSkillsSh,
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  getGroups.mockResolvedValue({ groups: [], total: 0 });
  searchSkillsSh.mockResolvedValue([]);
  resetLinkSuggestions();
  // The shape and the order are two answers again; these tests read the list as
  // repository cards — the shape most were written against — and the ones that
  // want the skill rows pick it themselves. Module state outlives a test, so the
  // choice is reset here rather than inherited.
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
    searchSkills.mockResolvedValue({
      hits: [
        {
          skill: {
            name: "pdf",
            repo: "anthropics/skills",
            description: "Spreadsheet editing and cell formulas.",
            stars: 1,
            downloads: 2,
          },
          matched: {},
        },
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
    expect(screen.queryByText(/个 skill/)).toBeNull();
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

  it("offers a confirmable store link for a tool-installed skill", async () => {
    const user = userEvent.setup();
    // The registry carries a same-slug entry whose description is *different*
    // enough (< 90%) from the installed skill's: because it is below the
    // auto-link threshold, the card offers the association for the user to
    // confirm instead of linking silently.
    searchSkills.mockResolvedValue({
      hits: [
        {
          skill: {
            name: "pdf",
            repo: "anthropics/skills",
            description: "Convert PDF files to images and text.",
            stars: 99,
            downloads: 99,
            path: "skills/anthropics/skills/pdf",
          },
          matched: {},
        },
      ],
      total: 1,
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
    searchSkills.mockResolvedValue({
      hits: [
        {
          skill: {
            name: "pdf",
            repo: "anthropics/skills",
            description: "PDF 文档读取、生成、合并、拆分与标注。",
            stars: 99,
            downloads: 99,
            path: "skills/anthropics/skills/pdf",
          },
          matched: {},
        },
      ],
      total: 1,
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
