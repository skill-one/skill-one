import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StrayFilesDialog, type StrayFilesTarget } from "./stray-files-dialog";

const TARGET: StrayFilesTarget = {
  name: "cursor",
  display: "Cursor",
  files: ["README.txt", "notes.md"],
  dirPath: "/Users/me/.cursor/skills",
};

function renderDialog(overrides: Partial<StrayFilesTarget> = {}) {
  const onOpenDir = vi.fn();
  const onClose = vi.fn();
  render(
    <StrayFilesDialog
      target={{ ...TARGET, ...overrides }}
      onOpenDir={onOpenDir}
      onClose={onClose}
    />,
  );
  return { onOpenDir, onClose };
}

describe("StrayFilesDialog", () => {
  it("stays closed without a target", () => {
    render(
      <StrayFilesDialog target={null} onOpenDir={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the stray files and the affected agent", async () => {
    renderDialog();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("README.txt")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.getByText(/Cursor（cursor）/)).toBeInTheDocument();
    expect(screen.getByText("需要手动移除这些文件后重试")).toBeInTheDocument();
    // The removed dir is surfaced in the description so the user knows where to act.
    expect(screen.getByText(/目录：/)).toBeInTheDocument();
    expect(screen.getByText("/Users/me/.cursor/skills")).toBeInTheDocument();
  });

  it("opens the agent's skills dir", async () => {
    const user = userEvent.setup();
    const { onOpenDir } = renderDialog();

    await user.click(screen.getByRole("button", { name: "打开目录" }));
    expect(onOpenDir).toHaveBeenCalledWith("/Users/me/.cursor/skills");
  });

  it("hides the open button when no directory resolves", async () => {
    renderDialog({ dirPath: null });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开目录" }),
    ).not.toBeInTheDocument();
  });

  it("closes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
