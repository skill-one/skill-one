import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { fetchAgentStatus, linkAgent, unlinkAgent } from "../../lib/local-skills";
import type { AgentLinkResult, AgentStatus } from "../../lib/skills-manager";
import { AgentIconGrid } from "./agent-icon-grid";

vi.mock("../../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/local-skills")>();
  return {
    ...actual,
    fetchAgentStatus: vi.fn(),
    linkAgent: vi.fn(),
    unlinkAgent: vi.fn(),
  };
});

const fetchAgentStatusMock = vi.mocked(fetchAgentStatus);
const linkAgentMock = vi.mocked(linkAgent);
const unlinkAgentMock = vi.mocked(unlinkAgent);

function agent(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    ...overrides,
  };
}

function result(
  status: AgentLinkResult["status"],
  overrides: Partial<AgentLinkResult> = {},
): AgentLinkResult {
  return {
    agent: "cursor",
    display: "Cursor",
    status,
    moved: [],
    skipped: [],
    parkedSkills: [],
    parkedOthers: [],
    backupDir: null,
    restored: [],
    restoredFrom: null,
    message: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAgentStatusMock.mockResolvedValue([agent({})]);
});

describe("AgentIconGrid link confirm dialog", () => {
  it("opens the confirm dialog for a dir with content and confirms the auto migration", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ internalSkills: ["pdf"], internalOthers: ["README.md"] }),
    ]);
    linkAgentMock.mockResolvedValue([
      result("migrated", { moved: ["pdf"], parkedOthers: ["README.md"] }),
    ]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("以下 skill 将导入（1）")).toBeInTheDocument();
    expect(within(dialog).getByText("以下文件将备份（1）")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认" }));

    // One call does it all: skills move into the canonical dir, everything
    // else parks into the backup slot.
    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
    expect(
      await screen.findByText("Cursor 已导入（移动 1 个 skills，其余文件已备份）"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms a files-only dir as a backed-up link", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ internalOthers: ["README.md"] }),
    ]);
    linkAgentMock.mockResolvedValue([
      result("migrated", { parkedOthers: ["README.md"] }),
    ]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));
    await user.click(await screen.findByRole("button", { name: "确认" }));

    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
    expect(
      await screen.findByText("Cursor 已链接（原有文件已备份，取消链接可恢复）"),
    ).toBeInTheDocument();
  });

  it("cancelling the dialog never touches the agent", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ internalSkills: ["pdf"] }),
    ]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));
    await user.click(await screen.findByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(linkAgentMock).not.toHaveBeenCalled();
    expect(unlinkAgentMock).not.toHaveBeenCalled();
  });

  it("links an empty dir directly without a dialog and without migrate", async () => {
    const user = userEvent.setup();
    linkAgentMock.mockResolvedValue([result("linked")]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    expect(await screen.findByText("Cursor 已链接")).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("cursor");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("unlinks a linked agent directly, restoring parked content", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({
        linked: true,
        pendingBackup: { path: "/backup/cursor", items: ["README.md"] },
      }),
    ]);
    unlinkAgentMock.mockResolvedValue([
      result("unlinked", {
        restored: ["README.md"],
        restoredFrom: "/backup/cursor/skills",
      }),
    ]);
    renderWithRouter(<AgentIconGrid />);

    // No dialog for linked agents — the click unlinks and the backend
    // restores the parked dir; the toast reports it.
    await user.click(await screen.findByRole("button", { name: /Cursor，点击取消链接/ }));

    expect(await screen.findByText("Cursor 已取消链接（已恢复 1 项备份内容）")).toBeInTheDocument();
    expect(unlinkAgentMock).toHaveBeenCalledWith("cursor");
    expect(linkAgentMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a refusal (stale backup) as a toast, not a dialog", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([agent({})]);
    linkAgentMock.mockResolvedValue([
      result("refused", {
        message: "a previous backup is still parked at /backup/cursor",
      }),
    ]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    expect(
      await screen.findByText(/Cursor 拒绝链接：a previous backup is still parked/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
