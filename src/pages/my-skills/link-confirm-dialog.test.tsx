import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LinkConfirmDialog, type LinkConfirmTarget } from "./link-confirm-dialog";

const TARGET: LinkConfirmTarget = {
  name: "cursor",
  display: "Cursor",
  skills: ["pdf", "docx"],
  others: ["README.txt", "notes.md"],
  backup: null,
};

function renderDialog(
  { target = TARGET }: { target?: LinkConfirmTarget | null } = {},
  handlers: Partial<{ onConfirm: () => void; onClose: () => void }> = {},
) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <LinkConfirmDialog
      target={target}
      busy={false}
      onConfirm={handlers.onConfirm ?? onConfirm}
      onClose={handlers.onClose ?? onClose}
    />,
  );
  return { onClose, onConfirm };
}

describe("LinkConfirmDialog", () => {
  it("stays closed without a target", () => {
    renderDialog({ target: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the two emphatic segments: skills to import and files to back up", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("以下 skill 将导入（2）")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("以下文件将备份（2）")).toBeInTheDocument();
    expect(screen.getByText("README.txt")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
  });

  it("offers only 确认 and 取消 — no mode choice", () => {
    renderDialog();

    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(buttons).toContain("取消");
    expect(buttons).toContain("确认");
    expect(
      buttons.filter((t) => t.includes("导入") || t.includes("备份") || t.includes("恢复")),
    ).toEqual([]);
  });

  it("starts the auto backup + skill migration on a single 确认 click", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("still renders the dialog when only non-skill files are present", () => {
    renderDialog({ target: { ...TARGET, skills: [] } });

    expect(screen.getByText("以下文件将备份（2）")).toBeInTheDocument();
    expect(screen.queryByText(/将导入/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();
  });

  it("warns about a pending backup that blocks linking", () => {
    renderDialog({
      target: {
        ...TARGET,
        backup: { path: "/backup/cursor", items: ["notes.md"] },
      },
    });

    expect(screen.getByText("备份待处理（1）")).toBeInTheDocument();
    expect(screen.getByText("/backup/cursor")).toBeInTheDocument();
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
