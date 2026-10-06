import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkillTagMenu } from "./skill-tag-menu";
import { renderWithRouter } from "../../test/test-utils";
import {
  loadCustomTags,
  resetMockProvenance,
  seedMockCustomTags,
} from "../../lib/provenance";

describe("SkillTagMenu", () => {
  beforeEach(() => {
    resetMockProvenance();
  });

  it("renders trigger with pencil affordance and opens popover on click", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <SkillTagMenu
        skillName="my-tool"
        assignedKey={null}
        effectiveKey="development"
        trigger={<span>开发工具</span>}
      />,
    );

    const triggerBtn = screen.getByRole("button", {
      name: "编辑 my-tool 的标签",
    });
    expect(triggerBtn).toBeInTheDocument();
    expect(screen.getByText("开发工具")).toBeInTheDocument();

    await user.click(triggerBtn);
    expect(await screen.findByText("选择标签")).toBeInTheDocument();
  });

  it("prompts cascade confirmation dialog when deleting an in-use custom tag", async () => {
    const user = userEvent.setup();
    seedMockCustomTags(
      [{ key: "active-tag", label: "效率工具", emoji: "⚡" }],
      { "skill-a": "active-tag", "skill-b": "active-tag" },
    );

    renderWithRouter(
      <SkillTagMenu
        skillName="skill-a"
        assignedKey="active-tag"
        effectiveKey="active-tag"
        trigger={<span>效率工具</span>}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "编辑 skill-a 的标签" }),
    );

    expect(await screen.findByRole("button", { name: "删除标签 效率工具" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // count of 2 skills

    // Click delete button
    const deleteBtn = screen.getByRole("button", {
      name: "删除标签 效率工具",
    });
    await user.click(deleteBtn);

    // Confirmation dialog appears with title
    expect(
      await screen.findByRole("heading", { name: "删除标签" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/正被 2 个技能使用，删除后这些技能将恢复默认分类/),
    ).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = screen.getByRole("button", { name: "删除标签" });
    await user.click(confirmBtn);

    // Verify tag is deleted from provenance
    await waitFor(async () => {
      const tags = await loadCustomTags();
      expect(tags.tagDefs.find((d) => d.key === "active-tag")).toBeUndefined();
    });
  });

  it("deletes unused custom tag immediately without confirmation dialog", async () => {
    const user = userEvent.setup();
    seedMockCustomTags(
      [{ key: "unused-tag", label: "闲置标签", emoji: "📦" }],
      {},
    );

    renderWithRouter(
      <SkillTagMenu
        skillName="skill-a"
        assignedKey={null}
        effectiveKey="development"
        trigger={<span>开发工具</span>}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "编辑 skill-a 的标签" }),
    );

    expect(await screen.findByText("闲置标签")).toBeInTheDocument();

    // Click delete button
    const deleteBtn = screen.getByRole("button", {
      name: "删除标签 闲置标签",
    });
    await user.click(deleteBtn);

    // No confirmation dialog needed
    expect(
      screen.queryByRole("heading", { name: "删除标签" }),
    ).not.toBeInTheDocument();

    // Verify tag is deleted
    await waitFor(async () => {
      const tags = await loadCustomTags();
      expect(tags.tagDefs.find((d) => d.key === "unused-tag")).toBeUndefined();
    });
  });

  it("filters tags matching search query and offers quick create for new tag", async () => {
    const user = userEvent.setup();
    seedMockCustomTags(
      [{ key: "active-tag", label: "效率工具", emoji: "⚡" }],
      {},
    );

    renderWithRouter(
      <SkillTagMenu
        skillName="skill-a"
        assignedKey={null}
        effectiveKey="development"
        trigger={<span>开发工具</span>}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "编辑 skill-a 的标签" }),
    );

    const input = await screen.findByRole("textbox", { name: "新建标签…" });
    await user.type(input, "测试分类");

    // Quick create option appears
    const createPrompt = await screen.findByRole("button", {
      name: /新建标签「测试分类」/,
    });
    expect(createPrompt).toBeInTheDocument();
    await user.click(createPrompt);

    // Verifies tag is created and assigned
    await waitFor(async () => {
      const tags = await loadCustomTags();
      expect(tags.tagDefs.find((d) => d.label === "测试分类")).toBeDefined();
      expect(tags.skillTags["skill-a"]).toBe("测试分类");
    });
  });

  it("toggles off assigned custom tag when clicking it again", async () => {
    const user = userEvent.setup();
    seedMockCustomTags(
      [{ key: "效率工具", label: "效率工具", emoji: "⚡" }],
      { "skill-a": "效率工具" },
    );

    renderWithRouter(
      <SkillTagMenu
        skillName="skill-a"
        assignedKey="效率工具"
        effectiveKey="效率工具"
        trigger={<span>效率工具</span>}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "编辑 skill-a 的标签" }),
    );

    const assignedTagBtn = await screen.findByRole("button", {
      name: /^效率工具/,
    });
    expect(assignedTagBtn).toBeInTheDocument();

    // Clicking the already-assigned tag toggles it off
    await user.click(assignedTagBtn);

    await waitFor(async () => {
      const tags = await loadCustomTags();
      expect(tags.skillTags["skill-a"]).toBeUndefined();
    });
  });

  it("renders '+ 添加标签' trigger for untagged skill and opens popover", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <SkillTagMenu
        skillName="my-tool"
        assignedKey={null}
        effectiveKey="unclassified"
      />,
    );

    const addBtn = screen.getByRole("button", {
      name: "为 my-tool 添加标签",
    });
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).toHaveTextContent("添加标签");
    expect(addBtn).not.toHaveTextContent("❓");

    await user.click(addBtn);
    expect(await screen.findByText("选择标签")).toBeInTheDocument();
  });

  it("does not render clear button when untagged even if assignedKey is passed", () => {
    renderWithRouter(
      <SkillTagMenu
        skillName="my-tool"
        assignedKey="orphan-key"
        effectiveKey="unclassified"
      />,
    );

    expect(
      screen.getByRole("button", { name: "为 my-tool 添加标签" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "清除 my-tool 的标签" }),
    ).not.toBeInTheDocument();
  });
});
