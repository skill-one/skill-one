import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
