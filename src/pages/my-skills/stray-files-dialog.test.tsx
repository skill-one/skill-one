import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StrayFilesDialog, type StrayFilesTarget } from "./stray-files-dialog";

const TARGET: StrayFilesTarget = {
  name: "cursor",
  display: "Cursor",
  skills: ["pdf", "docx"],
  files: ["README.txt", "notes.md"],
  dirPath: "/Users/me/.cursor/skills",
};

function renderDialog(overrides: Partial<StrayFilesTarget> = {}) {
  const onClose = vi.fn();
  render(
    <StrayFilesDialog target={{ ...TARGET, ...overrides }} onClose={onClose} />,
  );
  return { onClose };
}

describe("StrayFilesDialog", () => {
  it("stays closed without a target", () => {
    render(<StrayFilesDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("points the user to the agent's hover tooltip for handling", async () => {
    renderDialog();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("链接 Cursor（cursor）")).toBeInTheDocument();
    // The dialog never lists or operates on files itself: the hover tooltip
    // owns 一键导入 / 进入目录 / 一键删除.
    expect(
      screen.getByText(/请将鼠标悬停在该图标上/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开目录" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "一键迁移" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "一键删除" }),
    ).not.toBeInTheDocument();
  });

  it("closes via the 知道了 button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes by dismissing the dialog", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
