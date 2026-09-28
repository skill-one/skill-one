import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  screen,
  fireEvent,
  waitFor,
  within,
  configure,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MySkillsPage } from "./my-skills-page";
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

configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates and the
// page looks up the store entries behind recorded sources; both mocks answer
// "nothing found" by default so the worker-less test env stays silent, and the
// link-suggestion / store-stats tests below override them. The unified search
// view also asks the registry's grouped search for its store section; the mock
// answers empty by default, so that section hides.
const { searchSkills, lookupSkills, getGroups, registrySnapshot } = vi.hoisted(
  () => ({
    searchSkills: vi.fn(),
    lookupSkills: vi.fn(),
    getGroups: vi.fn(),
    // One stable object: the page reads it through useSyncExternalStore, which
    // treats a fresh snapshot on every call as an infinite render loop.
    registrySnapshot: { ready: true, epoch: 1 },
  }),
);
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills,
  getGroups,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  getGroups.mockResolvedValue({ groups: [], total: 0 });
  resetLinkSuggestions();
});

/** The persisted ledger's record for `name` (the store is JSONL). */
function ledgerRecord(name: string): { name: string; repo?: string } | undefined {
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
 * arrives on. The header carries the two controls both lists share, so a page
 * mounted alone could be typed into but not searched.
 */
function renderPage(route = "/my-skills") {
  return renderWithRouter(
    <>
      <AppHeader />
      <MySkillsPage />
    </>,
    { route },
  );
}

describe("MySkillsPage", () => {
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

    // The browse bar leads with 全部 and the 未分类 chip: an install no store
    // entry covers has no classification either, and that is not the dataset's
    // 其他 — nobody has looked at it at all.
    expect(
      await screen.findByRole("button", { name: /^全部/ }),
    ).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^未分类/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^其他/ })).toBeNull();
    // No install has a recorded source, so every skill lives in one pool card:
    // it lists the preview size, and its bar offers the one past it.
    expect(await screen.findByText("本地安装")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开 本地安装 的全部 6 个 skill" }),
    ).toHaveTextContent("1");
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(5);
    // The rest opens in place: one press on the bar, no navigation.
    await user.click(
      screen.getByRole("button", { name: "展开 本地安装 的全部 6 个 skill" }),
    );
    expect(screen.getByText("frontend-design")).toBeInTheDocument();
  });

  it("renders each installed skill", async () => {
    renderPage();

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("pptx")).toBeInTheDocument();
    expect(screen.getByText("mcp-builder")).toBeInTheDocument();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    // The sixth is past the pool card's preview: the bar's own offer accounts
    // for it — one press lists it with the rest.
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开 本地安装 的全部 6 个 skill" }),
    ).toHaveTextContent("1");
  });

  it("caps a repository's card at the preview size and offers the rest", async () => {
    const user = userEvent.setup();
    // All six installs share one repository: the card lists the first five and
    // its bar states the repository's own total, which is what lets a capped
    // list read as "these of them" — and the rest opens in place, with the
    // page one link behind the open card.
    seedMockProvenance(
      Object.fromEntries(
        [
          "pdf",
          "docx",
          "pptx",
          "mcp-builder",
          "code-review",
          "frontend-design",
        ].map((name) => [name, { repo: "acme/tools" }]),
      ),
    );
    renderPage();

    const bar = await screen.findByRole("button", {
      name: "展开 acme/tools 的全部 6 个 skill",
    });
    expect(bar).toHaveTextContent("1");
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(5);
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();

    await user.click(bar);
    // The rest opens in place, uncapped, without leaving the list.
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(6);
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

    for (let remaining = 6; remaining > 0; remaining--) {
      // The cards only answer to a role query once the panel has closed, so
      // each turn of the loop also proves the previous uninstall dismissed it.
      const [first] = await screen.findAllByRole("button", {
        name: /查看 .+ 详情/,
      });
      await user.click(first);
      await user.click(await screen.findByRole("button", { name: "移除" }));
      const ask = await screen.findByRole("dialog", {
        name: /移除 .+？/,
      });
      await user.click(within(ask).getByRole("button", { name: "移除" }));
      await waitFor(() =>
        expect(
          screen.queryAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(remaining - 1),
      );
    }

    expect(await screen.findByText("还没有安装任何技能")).toBeInTheDocument();
  });

  it("offers one group switch per card, on when every skill is enabled", async () => {
    renderPage();

    // All six installs pool into one card: its bar carries the one switch that
    // governs them all, checked because the pool is fully enabled. The five
    // previewed rows carry their own hover-revealed switches alongside it.
    const groupSwitch = await screen.findByRole("switch", {
      name: "全部关闭（本地安装）",
    });
    expect(groupSwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("switch")).toHaveLength(6);
  });

  it("disables every skill of a card with one press, and re-enables them", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    );

    // The whole pool is now off: the visible rows dim together and the bar's
    // own switch flips, including for the two skills past the preview cap that
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
    // Two bars, plus every previewed row's own switch (5 pool rows, 1 repo row).
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

  it("offers the repository's uninstalled skills behind one folded row", async () => {
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

    // The repository card states how many of its skills are missing, folded
    // under the installed group; the uninstalled skill itself stays hidden.
    const offer = await screen.findByRole("button", {
      name: "展开或收起 anthropics/skills 的 1 个未安装 skill",
    });
    expect(offer).toHaveTextContent("还有 1 个未安装");
    expect(screen.queryByText("pdf-annotate")).not.toBeInTheDocument();

    // One press unfolds the uninstalled group in place, below the divider,
    // with the store's install CTA on the row — no switch, and no drawer:
    // an uninstalled row's destination is the install itself. The installed
    // group is untouched: pdf keeps its own row and its switch.
    await user.click(offer);
    const section = screen.getByRole("list", {
      name: "anthropics/skills 的未安装 skill",
    });
    expect(within(section).getByText("pdf-annotate")).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "安装" }),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("switch")).toBeNull();

    // A second press folds it back.
    await user.click(offer);
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

  it("widens the card to the full row while the uninstalled group is open", async () => {
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
    const { container } = renderPage();

    const card = () =>
      container.querySelector('[data-repo="anthropics/skills"]')?.closest(
        "li",
      ) ?? null;
    const offer = () =>
      screen.getByRole("button", {
        name: "展开或收起 anthropics/skills 的 2 个未安装 skill",
      });
    await screen.findByRole("button", {
      name: "展开或收起 anthropics/skills 的 2 个未安装 skill",
    });

    // Folded, the card sits in its grid lane like every other card.
    expect(card()).not.toHaveClass("col-span-full");

    // Opening the uninstalled group is a reveal, so the card takes the same
    // wide footprint the bar's expansion uses — and the uninstalled rows
    // split into the same balanced columns the installed ones do.
    await user.click(offer());
    expect(card()).toHaveClass("col-span-full");
    const section = screen.getByRole("list", {
      name: "anthropics/skills 的未安装 skill",
    });
    expect(section).toHaveClass("grid-flow-col");

    // Folding the group hands the lane back.
    await user.click(offer());
    expect(card()).not.toHaveClass("col-span-full");
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

  it("does not open the drawer or the door from the bar's switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.click(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    );
    // The switch is a sibling of the bar's toggle, not a child: the press
    // toggles the group without opening the drawer or expanding the card.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开 本地安装 的全部 6 个 skill" }),
    ).toBeInTheDocument();
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
    expect(
      container.querySelectorAll('[data-slot="skill-cover"]'),
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

    // The resolved entry is what classifies the install, so a chip for its
    // domain joins the filter bar — and the card's bar prints the repository's
    // stars, the same figure the store's own repository cards carry.
    expect(
      await screen.findByRole("button", { name: /^内容创作/ }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("169600 stars")).toBeInTheDocument();

    // The drawer states the classification and the store figure the compact
    // repository row has no room for.
    await user.click(screen.getByRole("button", { name: "查看 pdf 详情" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("3M")).toBeInTheDocument();
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
    await waitFor(() => expect(ledgerRecord("pdf")?.repo).toBe("anthropics/skills"));
    // And pdf's card now names the source it was linked to on its own.
    await screen.findByText("anthropics/skills");
  });

  it("pre-fills the search box from the ?skill= deep link", async () => {
    // The menu bar popover deep links to /my-skills?skill=<name>; the page
    // must land with that skill pre-filtered and consume the param.
    renderPage("/my-skills?skill=pdf");

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
      ).toHaveLength(5),
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
    // a term index does not.
    await user.clear(screen.getByLabelText("搜索 Skill"));
    await user.type(screen.getByLabelText("搜索 Skill"), "df");
    expect(await screen.findByText(/未找到匹配/)).toBeInTheDocument();
  });

  it("shows a no-match empty state for a search with no results", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "zzz");

    expect(await screen.findByText(/未找到匹配/)).toBeInTheDocument();
  });

  it("answers a search with the store section beside the installs", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The installed answer leads, in the installed index's own relevance
    // order, and only it: docx does not match.
    const installed = await screen.findByRole("region", { name: "本地已安装" });
    expect(within(installed).getByText("pdf")).toBeInTheDocument();
    expect(within(installed).queryByText("docx")).not.toBeInTheDocument();
    // The store's section answers the same question from its own index; the
    // mocked registry carries nothing, so its section stays empty and hidden
    // rather than reading as a zero.
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "应用商店" })).toBeNull(),
    );
  });

  it("scopes the list to a classification from the chip row", async () => {
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

    await user.click(await screen.findByRole("button", { name: /^内容创作/ }));

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
    await user.click(screen.getByRole("button", { name: /^全部/ }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(6),
    );
  });

  // The repository unit (the default): one card per source, the cards ordered
  // by each card's newest install.

  /** The cards in list order, named by the repository each one stands for
   *  (the pool card, which has no repository, names itself). */
  function cardBarNames(): string[] {
    return Array.from(
      document.querySelectorAll('[data-slot="card"][data-repo]'),
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
    renderPage();

    await screen.findByText("zoo/new");
    // One flat list, newest install first: the fresh repository leads, the
    // pool follows on the age of its newest member, the all-old repository
    // trails.
    expect(cardBarNames()).toEqual(["zoo/new", "本地安装", "acme/tools"]);
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
    renderPage();

    await screen.findByText("acme/tools");
    // The pool (newest docx, 3 days) is the other, older card.
    expect(cardBarNames()).toEqual(["acme/tools", "本地安装"]);

    // Inside the card, newest first.
    const card = document.querySelector('[data-repo="acme/tools"]');
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
      Object.fromEntries(
        RUN_SOURCE.map((name) => [name, { repo }]),
      ),
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

    await user.click(screen.getByRole("button", { name: "按技能" }));

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

    await user.click(screen.getByRole("button", { name: "按技能" }));
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
      "查看 code-review 详情",
      "查看 frontend-design 详情",
    ]);

    // The installed list carries no run fold of its own: no row hides behind
    // one.
    expect(
      screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
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

    await user.click(await screen.findByRole("button", { name: "按技能" }));

    // Every install keeps its own row, across the day groups...
    expect(
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(6);
    // ...and no run fold survives from the store-style ranking.
    expect(
      screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
    ).toBeNull();
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
    const chip = await screen.findByRole("button", { name: /^内容创作/ });
    expect(chip).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
      "2",
    );

    await user.click(screen.getByRole("button", { name: "按技能" }));

    // The same chip now weighs skills, and 全部 every install.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^内容创作/ }),
      ).toHaveTextContent("2"),
    );
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
      "6",
    );

    // Scoping keeps the skills that belong to the domain, whoever they share a
    // source with: two is below the fold threshold, so each keeps its own row.
    await user.click(screen.getByRole("button", { name: /^内容创作/ }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(2),
    );

    // Switching units clears the scope with it: the two units weigh a domain
    // differently, so a scope set in one need not mean anything in the other.
    await user.click(screen.getByRole("button", { name: "按仓库" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
        "2",
      ),
    );
  });

  it("answers a search with rows in the skill unit", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "按技能" }));

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

  it("walks the skill unit's newest-first time order in the detail drawer", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "按技能" }));

    // The walk follows the newest-first time order: after code-review (200
    // days) the next install is frontend-design (400) — one press lands there,
    // never back on a newer install.
    await user.click(
      await screen.findByRole("button", { name: "查看 code-review 详情" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("code-review")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await within(dialog).findByText("frontend-design"),
    ).toBeInTheDocument();
  });

  it("stands the category bar down while searching", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");
    expect(screen.getByRole("button", { name: /^全部/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // A search re-orders the list by relevance and ignores the scope, so the
    // bar goes away with it — exactly as it does in the store.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^全部/ }),
      ).not.toBeInTheDocument(),
    );
  });
});
