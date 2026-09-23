import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  screen,
  fireEvent,
  waitFor,
  within,
  configure,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "../../components/ui/toast";

import { getExcludedAgents } from "../../lib/agent-link-preferences";

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

/** The page's search box debounces for real; 1 s is a contention flake. */
configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates and the
// page looks up the store entries behind recorded sources; both mocks answer
// "nothing found" by default so the worker-less test env stays silent, and the
// link-suggestion / store-stats tests below override them.
const { searchSkills, lookupSkills, registrySnapshot } = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  lookupSkills: vi.fn(),
  // One stable object: the page reads it through useSyncExternalStore, which
  // treats a fresh snapshot on every call as an infinite render loop.
  registrySnapshot: { ready: true, epoch: 1 },
}));
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  resetLinkSuggestions();
});

// The page reads installed skills through local-skills, which falls back to
// the mutable mock store in the browser (this test env), so mutations below
// actually change the data the page re-fetches after invalidate.

/** The agent strip is one avatar group; its dropdown menu carries the actions. */
async function openAgentMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /^管理 agent 链接/ }),
  );
}

/**
 * Menu items read as "<display> [pending counts] <state>" — the status dot
 * holds no text, and agents with content in their dir carry badge text between
 * the display name and the state.
 */
const menuItem = (display: string, state: string) =>
  screen.findByRole("menuitem", { name: new RegExp(`${display}.*${state}`) });

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
    // it lists the preview size, and its bar states the total.
    expect(await screen.findByText("本地安装")).toBeInTheDocument();
    expect(screen.getByText("6 个 skill")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(5);
    // The pool is not a repository, so its bar opens the page that lists it
    // whole rather than a repository's page.
    expect(
      screen.getByRole("link", { name: "查看本地安装，6 个 skill" }),
    ).toHaveAttribute("href", "/my-skills/local");
  });

  it("renders each installed skill", async () => {
    renderPage();

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("pptx")).toBeInTheDocument();
    expect(screen.getByText("mcp-builder")).toBeInTheDocument();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    // The sixth is past the pool card's preview: the bar's own total accounts
    // for it, and the bar's door is where it is listed whole.
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
    expect(screen.getByText("6 个 skill")).toBeInTheDocument();
  });

  it("caps a repository's card at the preview size and states its total", async () => {
    // All six installs share one repository: the card lists the first five and
    // its bar states the repository's own total, which is what lets a capped
    // list read as "these of them" beside the door to the rest.
    seedMockProvenance(
      Object.fromEntries(
        [
          "pdf",
          "docx",
          "pptx",
          "mcp-builder",
          "code-review",
          "frontend-design",
        ].map((name) => [name, { repo: "acme/tools", slug: name }]),
      ),
    );
    renderPage();

    const bar = await screen.findByRole("link", {
      name: "查看仓库 acme/tools，6 个 skill",
    });
    expect(bar).toHaveTextContent("6 个 skill");
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(5);
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
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

    // The panel closes with the skill: this list shrinks, so the index it was
    // open at would otherwise land on a different skill.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
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
      await waitFor(() =>
        expect(
          screen.queryAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(remaining - 1),
      );
    }

    expect(await screen.findByText("还没有安装任何技能")).toBeInTheDocument();
  });

  it("offers an enable toggle per row, all on by default", async () => {
    renderPage();

    const switches = await screen.findAllByRole("switch");
    expect(switches).toHaveLength(5);
    switches.forEach((sw) =>
      expect(sw).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("toggles a skill off and back on", async () => {
    const user = userEvent.setup();
    renderPage();

    const pdfOn = await screen.findByRole("switch", { name: "关闭 pdf" });
    await user.click(pdfOn);

    const pdfOff = await screen.findByRole("switch", { name: "开启 pdf" });
    expect(pdfOff).toHaveAttribute("aria-checked", "false");

    await user.click(pdfOff);
    expect(
      await screen.findByRole("switch", { name: "关闭 pdf" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("shows a backend-disabled skill as switched off", async () => {
    // A skill parked in the backend's disabled dir is reported with
    // enabled=false; the switch must reflect that instead of assuming on.
    setMockSkillEnabled("pdf", false);
    renderPage();

    const pdf = await screen.findByRole("switch", { name: "开启 pdf" });
    expect(pdf).toHaveAttribute("aria-checked", "false");
  });

  it("draws each row's switch without waiting for the pointer", async () => {
    const { container } = renderPage();

    await screen.findByRole("switch", { name: "关闭 pdf" });

    // Unlike the store's install button (revealed on hover), the installed
    // list's switch is a fact about the row: it is drawn always, so a reader
    // scanning for a disabled skill sees it without pointing at anything.
    const row = container.querySelector('[data-skill="pdf"]');
    expect(row).not.toBeNull();
    expect(row).not.toHaveClass("opacity-0");
    expect(row?.querySelector(".opacity-0")).toBeNull();
  });

  it("dims a disabled row and keeps its switch drawn", async () => {
    // The off switch is the fact that explains the dimmed row.
    setMockSkillEnabled("pdf", false);
    const { container } = renderPage();

    await screen.findByRole("switch", { name: "开启 pdf" });
    const row = container.querySelector('[data-skill="pdf"]');
    expect(row).toHaveClass("opacity-60");
    expect(row?.querySelector(".opacity-0")).toBeNull();
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
    expect(within(dialog).queryByText("anthropics/skills")).not.toBeInTheDocument();
  });

  it("does not open the drawer from the card's switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.click(await screen.findByRole("switch", { name: "关闭 pdf" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    const bars = container.querySelectorAll('[data-slot="card-footer"]');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveTextContent("本地安装");
    expect(
      container.querySelectorAll(
        '[data-slot="card-footer"] [data-slot="avatar"]',
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
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });

    // The sourced skill gets a card of its own, and its bar is the door to the
    // repository: the owner's face, the repo path, and the count.
    const bar = await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });
    expect(bar).toHaveTextContent("anthropics/skills");
    expect(bar).toHaveTextContent("1 个 skill");
    // The other five keep the pool card, whose bar names no repository.
    expect(screen.getAllByText("本地安装")).toHaveLength(1);
    // Only the sourced card can name an owner, so it carries the only face.
    expect(container.querySelectorAll('ul [data-slot="avatar"]')).toHaveLength(
      1,
    );
  });

  it("links a sourced skill's detail drawer to its repo instead of 本地安装", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderPage();
    await screen.findByText("pdf");
    // The provenance query lands asynchronously and moves pdf into its own
    // repository card; wait for that reshuffle to settle before clicking, so
    // the row is not detached mid-press.
    await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    // The panel now knows the repo: the description is the source link, not
    // the bare 本地安装 label.
    expect(
      within(dialog).getByText("anthropics/skills"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("本地安装")).not.toBeInTheDocument();
  });

  it("carries the enable switch, and no registry figures, into the drawer", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderPage();
    // Same wait: the provenance-driven regroup settles before the click.
    await screen.findByText("pdf");
    await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    // The same switch the row carries takes the slot the store's drawer puts
    // its install CTA in — this list installs nothing, its skills are already
    // on disk.
    expect(
      within(dialog).getByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "安装" }),
    ).not.toBeInTheDocument();
    // A recorded repo does not turn the drawer into the store's: there are no
    // registry figures to show, and an install figure rendering as a 0 here
    // would contradict the card, which shows none.
    expect(
      within(dialog).queryByText("安装量"),
    ).not.toBeInTheDocument();

    // The drawer's switch writes the same backend state the card's does.
    await user.click(within(dialog).getByRole("switch", { name: "关闭 pdf" }));
    expect(
      await within(dialog).findByRole("switch", { name: "开启 pdf" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("shows the store's classification and install count for a resolved source", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
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
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    // The lookup answers nothing for the ref (a fork the index dropped, say):
    // the card keeps the recorded source — its bar is what names it — and shows
    // no classification and no figure: an absent fact is not a zero one.
    renderPage();

    expect(
      await screen.findByRole("link", {
        name: /^查看仓库 anthropics\/skills/,
      }),
    ).toBeInTheDocument();
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
      name: "将 pdf 迁移至商店版",
    });
    await user.click(badge);

    // The popover lists the namesake candidates; clicking one confirms the
    // migration right there — no second dialog.
    const candidate = await screen.findByRole("button", {
      name: /anthropics\/skills/,
    });
    expect(screen.getByText(/\d+%/)).toBeInTheDocument();
    await user.click(candidate);

    // The association becomes indistinguishable from a native install: pdf now
    // lives in its own repository card, whose bar names the source, and the
    // affordance is gone.
    expect(
      await screen.findByRole("link", {
        name: /^查看仓库 anthropics\/skills/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "将 pdf 迁移至商店版" }),
    ).not.toBeInTheDocument();
    // And the persisted ledger carries the pick.
    expect(
      JSON.parse(localStorage.getItem("skill-one.provenance") ?? "{}").skills
        .pdf?.repo,
    ).toBe("anthropics/skills");
  });

  it("auto-links a tool-installed skill whose description matches a namesake", async () => {
    // Identical wording (≥ 90% similarity) is treated as the same skill and
    // linked automatically — no 迁移 badge or confirm dialog ever appears.
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

    // No migration affordance — it linked on its own.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "将 pdf 迁移至商店版" }),
      ).not.toBeInTheDocument(),
    );
    // The persisted ledger already carries the source the auto-link wrote.
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("skill-one.provenance") ?? "{}").skills
          .pdf?.repo,
      ).toBe("anthropics/skills"),
    );
    // And pdf's card now names the source it was linked to on its own.
    await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });
  });

  it("pre-fills the search box from the ?skill= deep link", async () => {
    // The menu bar popover deep links to /my-skills?skill=<name>; the page
    // must land with that skill pre-filtered and consume the param.
    renderPage("/my-skills?skill=pdf");

    expect(
      await screen.findByLabelText("搜索 Skill"),
    ).toHaveValue("pdf");
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

  it("scopes the list to a classification from the chip row", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
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

  // The skill unit: the store's second reading of the same installs — one row
  // per skill rather than one card per source. The page's own mocks serve it.

  /** The four installs every run test gathers into one source. */
  const RUN_SOURCE = ["pdf", "docx", "pptx", "mcp-builder"];

  /** Records one source for every name of the run. */
  function seedRunSource(repo = "acme/tools") {
    seedMockProvenance(
      Object.fromEntries(
        RUN_SOURCE.map((name) => [name, { repo, slug: name }]),
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
    expect(
      screen.queryByRole("link", { name: /^查看本地安装/ }),
    ).toBeNull();
    // The enable switch rides the row, so both units manage the same skills.
    expect(screen.getAllByRole("switch")).toHaveLength(6);
  });

  it("keeps the pool of source-less installs out of a run", async () => {
    const user = userEvent.setup();
    // Every install is a tool install: they share the empty source, and a run
    // *means* "these come from one repository" — folding them would have to
    // invent the one thing they do not have.
    renderPage();
    await screen.findByText("pdf");

    await user.click(screen.getByRole("button", { name: "按技能" }));

    await screen.findAllByRole("button", { name: /查看 .+ 详情/ });
    expect(screen.queryByRole("button", { name: /还有 \d+ 个来自/ })).toBeNull();
  });

  it("folds a repository's run of four installs, stating the run's own figure", async () => {
    const user = userEvent.setup();
    // Four installs share one source the registry still lists: the store's own
    // skill unit would fold them, and so does this one.
    seedRunSource();
    seedStoreEntries({ pdf: 30, docx: 20, pptx: 10, "mcp-builder": 5 });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "按技能" }));

    // The run leads with its most-installed skill and states the other three in
    // one line, with the run's own combined figure (30 + 20 + 10 + 5) — not the
    // whole list's and not another run's.
    const fold = await screen.findByRole("button", {
      name: /还有 3 个来自 acme\/tools/,
    });
    expect(fold).toHaveTextContent("共 65");
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "查看 docx 详情" })).toBeNull();

    // A press unfolds them in place, in rank order.
    await user.click(fold);
    expect(
      await screen.findByRole("button", { name: "查看 docx 详情" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /查看 .+ 详情/ })).toHaveLength(6);
  });

  it("states no figure for a run the registry cannot place", async () => {
    const user = userEvent.setup();
    // The same run, with no store entry behind it (a fork the index dropped):
    // its rows carry no install figure, so the fold has none to state either —
    // a fabricated 共 0 would contradict the rows above it.
    seedRunSource();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "按技能" }));

    const fold = await screen.findByRole("button", {
      name: /还有 3 个来自 acme\/tools/,
    });
    expect(fold).not.toHaveTextContent("共");
  });

  it("counts skills rather than repositories in the skill unit's chips", async () => {
    const user = userEvent.setup();
    seedMockProvenance({
      pdf: { repo: "anthropics/skills", slug: "pdf" },
      docx: { repo: "anthropics/skills", slug: "docx" },
    });
    seedStoreEntries({ pdf: 2991984, docx: 1991984 }, "content-creation");
    renderPage();

    // The repository unit weighs a domain by repositories: one source holds
    // both classified installs, so 内容创作 counts 1 beside 全部's 2 cards.
    const chip = await screen.findByRole("button", { name: /^内容创作/ });
    expect(chip).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "按技能" }));

    // The same chip now weighs skills, and 全部 every install.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^内容创作/ })).toHaveTextContent(
        "2",
      ),
    );
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent("6");

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

  it("walks the skill unit's own order in the detail drawer", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "按技能" }));

    // The pool rows keep the unit's own order (equal figures, so source and
    // name decide): code-review first, docx second.
    await user.click(
      await screen.findByRole("button", { name: "查看 code-review 详情" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("code-review")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await within(dialog).findByText("docx")).toBeInTheDocument();
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

  it("lists every detected agent in the strip's dropdown menu", async () => {
    const user = userEvent.setup();
    renderPage();

    await openAgentMenu(user);

    // The strip only ever shows a prefix inline (the mock detects 5 agents);
    // the menu carries all of them, each with its link state.
    expect(await screen.findAllByRole("menuitem")).toHaveLength(5);
    expect(await menuItem("Claude Code", "已链接")).toBeInTheDocument();
    expect(await menuItem("Codex", "已链接")).toBeInTheDocument();
    expect(await menuItem("Cursor", "未链接")).toBeInTheDocument();
    expect(await menuItem("Gemini CLI", "未链接")).toBeInTheDocument();
    expect(await menuItem("Windsurf", "原生")).toBeInTheDocument();
  });

  it("keeps the menu rows inert — linking is automatic", async () => {
    const user = userEvent.setup();
    renderPage();
    await openAgentMenu(user);

    // Selecting a row changes nothing: the menu is a status view, and the
    // settings dialog is the only place links are made or broken.
    await user.click(await menuItem("Gemini CLI", "未链接"));
    await user.click(await menuItem("Windsurf", "原生"));

    expect(await menuItem("Gemini CLI", "未链接")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getExcludedAgents()).toEqual([]);
  });

  it("unlinks a linked agent from the settings dialog and remembers it", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();
    await openAgentMenu(user);
    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", {
        name: "Claude Code 链接开关",
      }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Claude Code 已取消链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual(["claude-code"]);
  });

  it("re-links an unlinked agent from the settings dialog", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();
    await openAgentMenu(user);
    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", {
        name: "Gemini CLI 链接开关",
      }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Gemini CLI 已链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual([]);
  });

  it("pins a canonical agent's switch in the settings dialog", async () => {
    const user = userEvent.setup();
    renderPage();
    await openAgentMenu(user);
    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    const switchEl = await within(dialog).findByRole("switch", {
      name: "Windsurf 链接开关",
    });
    expect(switchEl).toHaveAttribute("aria-disabled", "true");
    expect(switchEl).toHaveAttribute("aria-checked", "true");
  });

});
