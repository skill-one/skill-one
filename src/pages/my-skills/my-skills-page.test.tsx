import { describe, it, expect, afterEach } from "vitest";
import {
  screen,
  fireEvent,
  waitFor,
  within,
  configure,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MySkillsPage } from "./my-skills-page";
import { renderWithRouter } from "../../test/test-utils";
import {
  addMockLocalSkill,
  installMockSkill,
  resetMockAgentStatus,
  resetMockInstalledSkills,
  setMockSkillEnabled,
} from "../../lib/mock-local";

/** The page's search box debounces for real; 1 s is a contention flake. */
configure({ asyncUtilTimeout: 5000 });

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

describe("MySkillsPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
  });

  it("shows the installed count in the bottom pager row", async () => {
    renderWithRouter(<MySkillsPage />);

    // Wait for the (mock) query to land: 6 skills installed globally.
    expect(await screen.findByText("共 6 个")).toBeInTheDocument();
    // A single-page list still shows the pager controls, both ends clamped.
    expect(
      screen.getByRole("link", { name: "上一页" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("link", { name: "下一页" }),
    ).toHaveAttribute("aria-disabled", "true");
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

  it("removes a skill from the list and updates the stats", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const removeButtons = await screen.findAllByTitle("移除");
    expect(removeButtons).toHaveLength(6);

    await user.click(removeButtons[0]); // pdf

    await waitFor(() => {
      expect(screen.queryByText("pdf")).not.toBeInTheDocument();
    });
    // The bottom pager count follows the (filtered) list size.
    expect(await screen.findByText("共 5 个")).toBeInTheDocument();
  });

  it("shows the empty state after removing every skill", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    for (let remaining = 6; remaining > 0; remaining--) {
      const [first] = await screen.findAllByTitle("移除");
      await user.click(first);
      await waitFor(() => {
        expect(screen.queryAllByTitle("移除")).toHaveLength(remaining - 1);
      });
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
    // The mock registry is not running, so the installed record has no index
    // entry: the panel reads the SKILL.md from the (mock) skills directory.
    expect(within(dialog).getByText("pdf")).toBeInTheDocument();
    expect(within(dialog).getByText("anthropics/skills")).toBeInTheDocument();
    expect(
      within(dialog).getByText("PDF 文档读取、生成、合并、拆分与标注。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("（浏览器演示数据：模拟的本地 SKILL.md）"),
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

  it("does not open the drawer from the row controls", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("共 6 个");

    await user.click(await screen.findByRole("switch", { name: "关闭 pdf" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click((await screen.findAllByTitle("移除"))[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses '暂无描述' as a placeholder when a skill has no description", async () => {
    installMockSkill("test/repo", "no-desc-skill");
    renderWithRouter(<MySkillsPage />);

    expect(await screen.findByText("no-desc-skill")).toBeInTheDocument();
    expect(screen.getByText("暂无描述")).toBeInTheDocument();
  });

  it("shows the source under the title", async () => {
    renderWithRouter(<MySkillsPage />);

    await screen.findByText("pdf");
    // 5 of the 6 mock skills come from anthropics/skills, 1 from
    // obra/superpowers.
    expect(screen.getAllByText("anthropics/skills")).toHaveLength(5);
    expect(screen.getByText("obra/superpowers")).toBeInTheDocument();
  });

  it("shows the repo owner's avatar for store-sourced skills", async () => {
    renderWithRouter(<MySkillsPage />);

    await screen.findByText("pdf");
    expect(screen.getAllByAltText("anthropics 的头像")).toHaveLength(5);
    expect(screen.getByAltText("obra 的头像")).toBeInTheDocument();
  });

  it("labels skills without a source record as 本地", async () => {
    addMockLocalSkill("local-skill");
    renderWithRouter(<MySkillsPage />);

    await screen.findByText("local-skill");
    expect(screen.getByText("本地")).toBeInTheDocument();
  });

  it("pre-fills the search box from the ?skill= deep link", async () => {
    // The menu bar popover deep links to /my-skills?skill=<name>; the page
    // must land with that skill pre-filtered and consume the param.
    renderWithRouter(<MySkillsPage />, { route: "/my-skills?skill=pdf" });

    expect(
      await screen.findByLabelText("搜索 Skill"),
    ).toHaveValue("pdf");
    expect(await screen.findByText("共 1 个")).toBeInTheDocument();
    expect(screen.queryByText("docx")).not.toBeInTheDocument();
  });

  it("filters skills by search text and updates the count", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("共 6 个");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    expect(await screen.findByText("共 1 个")).toBeInTheDocument();
    expect(screen.getAllByTitle("移除")).toHaveLength(1);
    expect(screen.queryByText("docx")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("搜索 Skill"));
    expect(await screen.findByText("共 6 个")).toBeInTheDocument();
    expect(screen.getAllByTitle("移除")).toHaveLength(6);
  });

  it("shows a no-match empty state for a search with no results", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("共 6 个");

    await user.type(screen.getByLabelText("搜索 Skill"), "zzz");

    expect(await screen.findByText(/未找到匹配/)).toBeInTheDocument();
    expect(screen.getByText("共 0 个")).toBeInTheDocument();
  });

  it("filters by enablement state from the toolbar dropdown", async () => {
    const user = userEvent.setup();
    setMockSkillEnabled("pdf", false);
    renderWithRouter(<MySkillsPage />);
    await screen.findByText("共 6 个");

    await user.click(screen.getByRole("button", { name: "筛选" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "已禁用" }),
    );

    // Only the disabled skill survives; the trigger now shows the selection.
    expect(await screen.findByText("共 1 个")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "开启 pdf" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("docx")).not.toBeInTheDocument();
    // The trigger now spells out the active filter.
    expect(
      await screen.findByRole("button", { name: /已禁用/ }),
    ).toBeInTheDocument();
  });

  it("pages through the list and clamps back when the last page empties", async () => {
    const user = userEvent.setup();
    // installMockSkill prepends, so page 1 holds extra-18..extra-0 plus the
    // first five base skills and the tail base skill lands on page 2.
    for (let i = 0; i < 19; i++) installMockSkill("test/repo", `extra-${i}`);
    renderWithRouter(<MySkillsPage />);

    expect(await screen.findByText("共 25 个")).toBeInTheDocument();
    expect(screen.getByText("extra-18")).toBeInTheDocument();
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("下一页"));

    expect(await screen.findByText("frontend-design")).toBeInTheDocument();
    expect(screen.queryByText("extra-18")).not.toBeInTheDocument();

    // Removing the only skill on the last page clamps back to page 1.
    const [onlyRemove] = await screen.findAllByTitle("移除");
    await user.click(onlyRemove);
    await waitFor(() => {
      expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("共 24 个")).toBeInTheDocument();
    expect(screen.getByText("extra-18")).toBeInTheDocument();
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

  it("explains why a canonical agent cannot be unlinked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await openAgentMenu(user);

    await user.click(await menuItem("Windsurf", "原生"));

    expect(
      await screen.findByText("Windsurf 使用原生 skills 目录，无法取消链接"),
    ).toBeInTheDocument();
  });

  it("links an unlinked agent from the menu and shows a notice", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await openAgentMenu(user);

    await user.click(await menuItem("Gemini CLI", "未链接"));

    expect(await screen.findByText("Gemini CLI 已链接")).toBeInTheDocument();
  });

  it("unlinks a linked agent from the menu and shows a notice", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await openAgentMenu(user);

    await user.click(await menuItem("Claude Code", "已链接"));

    expect(
      await screen.findByText("Claude Code 已取消链接"),
    ).toBeInTheDocument();
  });

  it("spells out what linking will do for a dir that already holds content", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);
    await openAgentMenu(user);

    // Cursor carries 2 skills and 1 stray file in its own dir in the mock:
    // the confirm dialog is the single place those details are spelled out.
    await user.click(await menuItem("Cursor", "未链接"));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("以下 skill 将导入（2）"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("以下文件将备份（1）"),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认" }));

    expect(await screen.findByText("Cursor 已链接")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

});
