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

function renderDialog(
  overrides: Partial<StrayFilesTarget> = {},
  handlers: Partial<{
    onMigrate: () => void;
    onRemoveStrays: () => void;
    onOpenDir: () => void;
    onClose: () => void;
  }> = {},
) {
  const onClose = vi.fn();
  const onMigrate = vi.fn();
  const onRemoveStrays = vi.fn();
  const onOpenDir = vi.fn();
  render(
    <StrayFilesDialog
      target={{ ...TARGET, ...overrides }}
      busy={false}
      onMigrate={handlers.onMigrate ?? onMigrate}
      onRemoveStrays={handlers.onRemoveStrays ?? onRemoveStrays}
      onOpenDir={handlers.onOpenDir ?? onOpenDir}
      onClose={handlers.onClose ?? onClose}
    />,
  );
  return { onClose, onMigrate, onRemoveStrays, onOpenDir };
}

describe("StrayFilesDialog", () => {
  it("stays closed without a target", () => {
    render(<StrayFilesDialog target={null} busy={false} onMigrate={vi.fn()} onRemoveStrays={vi.fn()} onOpenDir={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the importable skills and the blocking files with counts", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("可导入的 skills（2）")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("需先处理的其他文件（2）")).toBeInTheDocument();
    expect(screen.getByText("README.txt")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
  });

  it("disables import while stray files remain, enabling it once cleared", () => {
    const { rerender } = render(
      <StrayFilesDialog target={TARGET} busy={false} onMigrate={vi.fn()} onRemoveStrays={vi.fn()} onOpenDir={vi.fn()} onClose={vi.fn()} />,
    );

    const blocked = screen.getByRole("button", { name: "先处理其他文件" });
    expect(blocked).toBeDisabled();

    rerender(
      <StrayFilesDialog target={{ ...TARGET, files: [] }} busy={false} onMigrate={vi.fn()} onRemoveStrays={vi.fn()} onOpenDir={vi.fn()} onClose={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "导入 2 个 skills 并链接" }),
    ).toBeEnabled();
  });

  it("starts the link on a single import click", async () => {
    const user = userEvent.setup();
    const { onMigrate } = renderDialog({ files: [] });

    await user.click(screen.getByRole("button", { name: "导入 2 个 skills 并链接" }));
    expect(onMigrate).toHaveBeenCalledTimes(1);
  });

  it("arms destructive deletion and executes it on the second click", async () => {
    const user = userEvent.setup();
    const { onRemoveStrays } = renderDialog({ skills: [] });

    // First click only arms the button.
    await user.click(screen.getByRole("button", { name: "删除 2 个文件" }));
    expect(onRemoveStrays).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除？" }));
    expect(onRemoveStrays).toHaveBeenCalledTimes(1);
  });

  it("opens the agent's skills dir via 进入目录", async () => {
    const user = userEvent.setup();
    const { onOpenDir } = renderDialog();

    await user.click(screen.getByRole("button", { name: "进入目录" }));
    expect(onOpenDir).toHaveBeenCalledTimes(1);
  });

  it("hides 进入目录 when the dir path is unknown", () => {
    renderDialog({ dirPath: null });
    expect(
      screen.queryByRole("button", { name: "进入目录" }),
    ).not.toBeInTheDocument();
  });

  it("closes via 取消 and by dismissing the dialog", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
