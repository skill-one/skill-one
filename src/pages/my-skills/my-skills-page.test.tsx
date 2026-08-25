import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

// The page reads installed skills through local-skills, which falls back to
// the mutable mock store in the browser (this test env), so mutations below
// actually change the data the page re-fetches after invalidate.

describe("MySkillsPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
  });

  it("renders the stats card with the installed count", async () => {
    renderWithRouter(<MySkillsPage />);

    // Wait for the (mock) query to land: 6 skills installed globally.
    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.getByText("已安装")).toBeInTheDocument();
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
    // Stats count lives in the installed-skills section.
    const statsSection = screen.getByText("已安装").closest("div")
      ?.parentElement as HTMLElement;
    expect(within(statsSection).getByText("5")).toBeInTheDocument();
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

  it("renders the agent icon grid with a minimal warning badge for inner content", async () => {
    renderWithRouter(<MySkillsPage />);

    // Cursor carries 2 skills and 1 stray file in its own dir in the mock:
    // the badge is a minimal warning without counts, details live in the
    // hover tooltip and the link-preview dialog.
    const cursor = await screen.findByLabelText("Cursor，点击链接");
    expect(cursor).toBeInTheDocument();
    expect(
      within(cursor).getByLabelText(
        "该 agent 目录内已有 skills 或其他文件，点击查看详情",
      ),
    ).toBeInTheDocument();

    // Linked agents offer 取消链接; canonical ones explain on click instead.
    expect(
      screen.getByLabelText("Claude Code，点击取消链接"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Claude Code，点击链接/)).toBeNull();
    expect(screen.getByLabelText("Windsurf，点击取消链接")).toBeInTheDocument();
  });

  it("lists the specific skills and files in the agent hover tooltip", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const cursor = await screen.findByLabelText("Cursor，点击链接");
    await user.hover(cursor);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Cursor")).toBeInTheDocument();
    expect(within(tooltip).getByText("pdf")).toBeInTheDocument();
    expect(within(tooltip).getByText("docx")).toBeInTheDocument();
    expect(within(tooltip).getByText("README.md")).toBeInTheDocument();
  });

  it("offers segmented actions in the hover tooltip: 一键导入 for skills, 进入目录 / 一键删除 for files", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const cursor = await screen.findByLabelText("Cursor，点击链接");
    await user.hover(cursor);

    const tooltip = await screen.findByRole("tooltip");
    expect(
      within(tooltip).getByRole("button", { name: "一键导入" }),
    ).toBeInTheDocument();
    expect(
      within(tooltip).getByRole("button", { name: "进入目录" }),
    ).toBeInTheDocument();
    expect(
      within(tooltip).getByRole("button", { name: "一键删除" }),
    ).toBeInTheDocument();
  });

  it("shows a structured info tooltip on agent icon hover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const claude = await screen.findByLabelText("Claude Code，点击取消链接");
    await user.hover(claude);

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("已链接")).toBeInTheDocument();
    expect(screen.getByText("可使用所有已安装 skills")).toBeInTheDocument();
  });

  it("explains why a canonical agent cannot be unlinked on click", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const windsurf = await screen.findByLabelText("Windsurf，点击取消链接");
    await user.click(windsurf);

    expect(
      await screen.findByText("Windsurf 使用原生 skills 目录，无法取消链接"),
    ).toBeInTheDocument();
  });

  it("unlinks a linked agent on icon click and shows a notice", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const claude = await screen.findByLabelText("Claude Code，点击取消链接");
    await user.click(claude);

    // After unlinking, the agent is offered as linkable again and a result
    // notice is shown in the grid.
    expect(
      await screen.findByLabelText("Claude Code，点击链接"),
    ).toBeInTheDocument();
    expect(await screen.findByText(/已取消链接/)).toBeInTheDocument();
  });

  it("links an unlinked agent on icon click and shows a notice", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const gemini = await screen.findByLabelText("Gemini CLI，点击链接");
    await user.click(gemini);

    // After linking, the agent is no longer offered as a clickable action and a
    // result notice is shown in the grid.
    await waitFor(() => {
      expect(screen.queryByLabelText(/Gemini CLI，点击链接/)).toBeNull();
    });
    expect(await screen.findByText("Gemini CLI 已链接")).toBeInTheDocument();
  });
});
