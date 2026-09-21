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
const { getPage, lookupSkills, registrySnapshot } = vi.hoisted(() => ({
  getPage: vi.fn(),
  lookupSkills: vi.fn(),
  // One stable object: the page reads it through useSyncExternalStore, which
  // treats a fresh snapshot on every call as an infinite render loop.
  registrySnapshot: { ready: true, epoch: 1 },
}));
vi.mock("../../lib/registry/client", () => ({
  getPage,
  lookupSkills,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  getPage.mockResolvedValue({ hits: [], total: 0 });
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
 * The group header trigger of one group, addressed by its aria-label —
 * titles stay intact there even when the figures beside them are long.
 */
function groupHeader(title: string, count: number) {
  return screen.getByRole("button", {
    name: `分组 ${title}，${count} 个 skill`,
  });
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

  it("groups the ungrouped default into a single 未关联仓库 group", async () => {
    renderWithRouter(<MySkillsPage />);

    // Wait for the (mock) query to land: 6 skills installed globally, none
    // with a recorded source — they pool into one group.
    expect(
      await screen.findByRole("button", {
        name: "分组 未关联仓库，6 个 skill",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("pdf")).toBeInTheDocument();
  });

  it("renders each installed skill", async () => {
    renderWithRouter(<MySkillsPage />);

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("pptx")).toBeInTheDocument();
    expect(screen.getByText("mcp-builder")).toBeInTheDocument();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.getByText("frontend-design")).toBeInTheDocument();
  });

  it("removes a skill from its detail panel and updates the stats", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

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
    renderWithRouter(<MySkillsPage />);

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
    renderWithRouter(<MySkillsPage />);

    const switches = await screen.findAllByRole("switch");
    expect(switches).toHaveLength(6);
    switches.forEach((sw) =>
      expect(sw).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("toggles a skill off and back on", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

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
    renderWithRouter(<MySkillsPage />);

    const pdf = await screen.findByRole("switch", { name: "开启 pdf" });
    expect(pdf).toHaveAttribute("aria-checked", "false");
  });

  it("shows an enabled skill's switch without hover", async () => {
    const { container } = renderWithRouter(<MySkillsPage />);

    await screen.findByRole("switch", { name: "关闭 pdf" });

    // Like the store's install button, the corner control is always shown: a
    // grid whose controls appear only under the pointer reads as unstable.
    const action = container.querySelector(
      '[data-skill="pdf"] [data-slot="card-action"]',
    );
    expect(action).not.toHaveClass("opacity-0", "pointer-events-none");
  });

  it("keeps a disabled skill's switch visible without hover", async () => {
    // The off switch is the fact that explains the dimmed card.
    setMockSkillEnabled("pdf", false);
    const { container } = renderWithRouter(<MySkillsPage />);

    await screen.findByRole("switch", { name: "开启 pdf" });
    expect(
      container.querySelector('[data-skill="pdf"] [data-slot="card-action"]'),
    ).not.toHaveClass("opacity-0");
  });

  it("shows each skill's description", async () => {
    renderWithRouter(<MySkillsPage />);

    expect(
      await screen.findByText("PDF 文档读取、生成、合并、拆分与标注。"),
    ).toBeInTheDocument();
  });

  it("opens the shared detail drawer when a row is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

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
    renderWithRouter(<MySkillsPage />);

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
    renderWithRouter(<MySkillsPage />);

    await user.click(
      await screen.findByRole("button", { name: "查看 my-local 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
    expect(within(dialog).queryByText("anthropics/skills")).not.toBeInTheDocument();
  });

  it("does not open the drawer from the card's switch", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("pdf");

    await user.click(await screen.findByRole("switch", { name: "关闭 pdf" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses '暂无描述' as a placeholder when a skill has no description", async () => {
    installMockSkill("no-desc-skill");
    renderWithRouter(<MySkillsPage />);

    expect(await screen.findByText("no-desc-skill")).toBeInTheDocument();
    expect(screen.getByText("暂无描述")).toBeInTheDocument();
  });

  it("labels every card 本地安装 and still leads it with the skill's image", async () => {
    const { container } = renderWithRouter(<MySkillsPage />);

    await screen.findByText("pdf");
    // Skills installed by other tools (no ledger entry) read as a local
    // install; every card still leads with its skill's image. Nothing loads
    // in this env and no source can be named, so the slot shows the skill's
    // own initial — and no owner avatar joins it.
    expect(screen.getAllByText("本地安装")).toHaveLength(6);
    const covers = container.querySelectorAll('ul [data-slot="skill-cover"]');
    expect(covers).toHaveLength(6);
    expect(covers[0]).toHaveTextContent("p");
    expect(container.querySelectorAll('ul [data-slot="avatar"]')).toHaveLength(
      0,
    );
  });

  it("shows the recorded source repo with the owner's author chip under the name", async () => {
    const { container } = renderWithRouter(<MySkillsPage />);
    // The ledger has a source for pdf (installed through this app); docx is
    // a tool-installed skill with no entry.
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });

    // The sourced card names its repo on the source line under the name: the
    // author chip rides it, and the chip's hover card states what it stands
    // for.
    const chip = await screen.findByRole("button", {
      name: "仓库 anthropics/skills",
    });
    expect(chip.closest('[data-slot="card-description"]')).not.toBeNull();
    // docx keeps the local-install presentation.
    expect(screen.getAllByText("本地安装")).toHaveLength(5);
    // The cover degrades to its author's initial — the owner for the sourced
    // card, the skill's own name for the ones the ledger cannot name.
    expect(
      container.querySelector('[aria-label="pdf 封面图"]'),
    ).toHaveTextContent("a");
    expect(
      container.querySelector('[aria-label="docx 封面图"]'),
    ).toHaveTextContent("d");
    // Only the sourced card can name an author, so only its metadata rail
    // carries an author chip — and the rail exists for that chip alone, since
    // the registry holds no entry to classify or rank the skill by.
    expect(container.querySelectorAll('ul [data-slot="avatar"]')).toHaveLength(
      1,
    );
  });

  it("links a sourced skill's detail drawer to its repo instead of 本地安装", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("pdf");
    // The provenance query lands asynchronously and moves pdf into its own
    // repository group; wait for that reshuffle to settle before clicking,
    // so the card is not detached mid-press.
    await screen.findByRole("button", { name: "仓库 anthropics/skills" });

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
    renderWithRouter(<MySkillsPage />);
    // Same wait: the provenance-driven regroup settles before the click.
    await screen.findByText("pdf");
    await screen.findByRole("button", { name: "仓库 anthropics/skills" });

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
    // registry figures to show, and the popularity figure that used to render
    // as a 0 here would contradict the card, which shows none.
    expect(
      within(dialog).queryByRole("button", { name: /^热度 / }),
    ).not.toBeInTheDocument();

    // The drawer's switch writes the same backend state the card's does.
    await user.click(within(dialog).getByRole("switch", { name: "关闭 pdf" }));
    expect(
      await within(dialog).findByRole("switch", { name: "开启 pdf" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("shows the store's classification and popularity for a resolved source", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    // The registry still lists the source the ledger recorded, so the installed
    // list has the store facts an on-disk record never carries. Blended figure:
    // √((2991984 + 1) × (169600 + 1)) − 1 = 712350.
    const figure = "热度 712.4K：安装 3M · Star 169.6K";
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
    renderWithRouter(<MySkillsPage />);

    // The card is the store's card: the profiles dataset's chip and the same
    // blended figure the store's own rows show.
    expect(await screen.findByText("内容创作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: figure })).toBeInTheDocument();

    // And the drawer agrees with the row that opened it, figure included.
    await user.click(screen.getByRole("button", { name: "查看 pdf 详情" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: figure }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("内容创作")).toBeInTheDocument();
  });

  it("shows no store facts for a source the registry no longer lists", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    // The lookup answers nothing for the ref (a fork the index dropped, say):
    // the card keeps the recorded source — the author chip is what names it —
    // and shows no chip and no figure: an absent figure is not a zero one.
    renderWithRouter(<MySkillsPage />);

    expect(
      await screen.findByRole("button", { name: "仓库 anthropics/skills" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^热度 / }),
    ).not.toBeInTheDocument();
  });

  it("offers a confirmable store link for a tool-installed skill", async () => {
    const user = userEvent.setup();
    // The registry carries a same-slug entry whose description is *different*
    // enough (< 90%) from the installed skill's: because it is below the
    // auto-link threshold, the card offers the association for the user to
    // confirm instead of linking silently.
    getPage.mockResolvedValue({
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
    renderWithRouter(<MySkillsPage />);

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

    // The association becomes indistinguishable from a native install: the
    // card now speaks for the repo through its author chip, and the
    // affordance is gone.
    const card = screen.getByRole("button", { name: "查看 pdf 详情" });
    await waitFor(() =>
      expect(
        within(card).getByRole("button", { name: "仓库 anthropics/skills" }),
      ).toBeInTheDocument(),
    );
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
    getPage.mockResolvedValue({
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
    renderWithRouter(<MySkillsPage />);

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
    // And pdf has left the unlinked group (6 → 5) on its own.
    await screen.findByRole("button", { name: /未关联仓库.*5 个/ });
  });

  it("pre-fills the search box from the ?skill= deep link", async () => {
    // The menu bar popover deep links to /my-skills?skill=<name>; the page
    // must land with that skill pre-filtered and consume the param.
    renderWithRouter(<MySkillsPage />, { route: "/my-skills?skill=pdf" });

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
    renderWithRouter(<MySkillsPage />);
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
    const { container } = renderWithRouter(<MySkillsPage />);
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The installed list's index reports matched terms per field exactly as
    // the registry's worker does, so the shared card marks them the same way.
    await waitFor(() =>
      expect(container.querySelector("mark")).toHaveTextContent("pdf"),
    );
  });

  it("renders no marks outside a search", async () => {
    const { container } = renderWithRouter(<MySkillsPage />);

    await screen.findByText("pdf");
    expect(container.querySelector("mark")).toBeNull();
  });

  it("searches Chinese text but not a fragment inside a word", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
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
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "zzz");

    expect(await screen.findByText(/未找到匹配/)).toBeInTheDocument();
  });

  it("groups by enablement state from the toolbar dropdown", async () => {
    const user = userEvent.setup();
    setMockSkillEnabled("pdf", false);
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("pdf");

    await user.click(screen.getByRole("button", { name: "按仓库" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /^按状态/ }),
    );

    // The enablement split takes over: two groups, running skills first,
    // with the disabled skill dimmed inside its own group.
    expect(await screen.findByText("已启用")).toBeInTheDocument();
    expect(groupHeader("已启用", 5)).toBeInTheDocument();
    expect(groupHeader("已禁用", 1)).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "开启 pdf" }),
    ).toBeInTheDocument();
  });

  it("annotates the grouping options with the group counts", async () => {
    const user = userEvent.setup();
    setMockSkillEnabled("pptx", false);
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("pdf");

    await user.click(screen.getByRole("button", { name: "按仓库" }));
    // The menu's portal mounts asynchronously under Base UI.
    const rows = (await screen.findAllByRole("menuitemradio")).map(
      (m) => m.textContent,
    );
    // All six skills share one repo-less pool; disabling pptx splits the
    // status mode into two groups; nothing is classified.
    expect(rows).toEqual(["按仓库1 组", "按状态2 组", "按类型1 组"]);
  });

  it("lists every detected agent in the strip's dropdown menu", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

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
    renderWithRouter(<MySkillsPage />);
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
    renderWithRouter(<MySkillsPage />);
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
    renderWithRouter(<MySkillsPage />);
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
    renderWithRouter(<MySkillsPage />);
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
