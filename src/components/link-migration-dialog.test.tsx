import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LinkMigrationDialog } from "./link-migration-dialog";
import type { AgentLinkResult } from "../lib/skills-manager";

const AGENT_DIR = "/Users/me/.cursor/skills";
const CANONICAL = "/Users/me/.agents/skills";

/** A refusal carrying only skills, i.e. the migratable case. */
function refusal(overrides: Partial<AgentLinkResult> = {}): AgentLinkResult {
  return {
    agent: "cursor",
    display: "Cursor",
    status: "refused",
    moved: [],
    skipped: [],
    skills: ["pdf", "xlsx"],
    message: `${AGENT_DIR} has existing skills; rerun with --migrate to move them into ${CANONICAL}`,
    ...overrides,
  };
}

function renderDialog(
  props: Partial<Parameters<typeof LinkMigrationDialog>[0]> = {},
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <LinkMigrationDialog
      refused={refusal()}
      installedNames={[]}
      migrating={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe("LinkMigrationDialog", () => {
  it("stays closed without a refusal", () => {
    renderDialog({ refused: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the skills that would be migrated", async () => {
    renderDialog();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("xlsx")).toBeInTheDocument();
    expect(screen.getByText(/Cursor（cursor）/)).toBeInTheDocument();
    expect(screen.queryByText(/将跳过/)).not.toBeInTheDocument();
  });

  it("flags skills the canonical dir already provides", async () => {
    renderDialog({ installedNames: ["xlsx"] });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("将跳过，保留规范目录版本"),
    ).toBeInTheDocument();
    expect(screen.getByText(/将移动 1 个/)).toBeInTheDocument();
  });

  it("confirms the migration", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: "确认迁移" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels the migration", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("blocks confirming while non-skill files remain", async () => {
    const { onConfirm } = renderDialog({
      refused: refusal({
        skills: ["pdf"],
        message: `${AGENT_DIR} has existing skills and non-skill files; remove the files (README.md, notes.txt), then rerun with --migrate`,
      }),
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("存在无法迁移的文件")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "确认迁移" });
    expect(confirm).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the raw reason when nothing could be itemised", async () => {
    const message = `${AGENT_DIR} has existing content; rerun with --migrate to move it into ${CANONICAL}`;
    renderDialog({ refused: refusal({ skills: [], message }) });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认迁移" })).toBeEnabled();
  });

  it("disables both actions while migrating", async () => {
    renderDialog({ migrating: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认迁移" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  });
});
