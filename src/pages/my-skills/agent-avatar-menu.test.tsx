import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { fetchAgentStatus, linkAgent, unlinkAgent } from "../../lib/local-skills";
import type { AgentLinkResult, AgentStatus } from "../../lib/skills-manager";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { AVATAR_GROUP_MAX } from "./agent-avatar-group";

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

function manyAgents(count: number): AgentStatus[] {
  return Array.from({ length: count }, (_, i) =>
    agent({ name: `agent-${i}`, display: `Agent ${i}` }),
  );
}

/** Open the avatar strip's dropdown menu, which carries every action. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /^管理 agent 链接/ }),
  );
}

/** Menu items read as "<display> <state>" — the status dot holds no text. */
const menuItem = (display: string, state: string) =>
  screen.findByRole("menuitem", { name: new RegExp(`${display}\\s+${state}`) });

beforeEach(() => {
  vi.clearAllMocks();
  fetchAgentStatusMock.mockResolvedValue([agent({})]);
});

describe("AgentAvatarMenu strip and menu", () => {
  it("lists every agent in the menu, including the ones folded into +N", async () => {
    const user = userEvent.setup();
    const total = AVATAR_GROUP_MAX + 3;
    fetchAgentStatusMock.mockResolvedValue(manyAgents(total));
    const { container } = renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);

    expect(await screen.findAllByRole("menuitem")).toHaveLength(total);
    // The strip itself stays short: only a prefix renders inline.
    expect(
      container.querySelectorAll('[data-slot="avatar"]'),
    ).toHaveLength(AVATAR_GROUP_MAX);
    expect(
      container.querySelector('[data-slot="avatar-group-count"]'),
    ).toHaveTextContent("+3");
  });

  it("labels each agent with its link state", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "claude", display: "Claude Code", linked: true }),
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
      agent({ name: "cursor", display: "Cursor", internalSkills: ["pdf"] }),
      agent({ name: "gemini", display: "Gemini CLI" }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);

    expect(await menuItem("Claude Code", "已链接")).toBeInTheDocument();
    expect(await menuItem("Windsurf", "原生")).toBeInTheDocument();
    // A dir with content still reads as unlinked — the confirm dialog is what
    // spells out what linking will do.
    expect(await menuItem("Cursor", "未链接")).toBeInTheDocument();
    expect(await menuItem("Gemini CLI", "未链接")).toBeInTheDocument();
  });

  it("offers no menu before the agents arrive", async () => {
    fetchAgentStatusMock.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AgentAvatarMenu />);

    // Nothing to act on while loading, so the strip's trigger is withheld.
    await Promise.resolve();
    expect(
      screen.queryByRole("button", { name: /^管理 agent 链接/ }),
    ).not.toBeInTheDocument();
  });

  it("reports a load failure", async () => {
    fetchAgentStatusMock.mockRejectedValue(new Error("boom"));
    renderWithRouter(<AgentAvatarMenu />);

    expect(await screen.findByText("加载失败：boom")).toBeInTheDocument();
  });

  it("reports when no agent is detected", async () => {
    fetchAgentStatusMock.mockResolvedValue([]);
    renderWithRouter(<AgentAvatarMenu />);

    expect(await screen.findByText("未检测到可用的 agent")).toBeInTheDocument();
  });
});

describe("AgentAvatarMenu link actions", () => {
  it("links an empty dir directly, without a dialog and without migrate", async () => {
    const user = userEvent.setup();
    linkAgentMock.mockResolvedValue([result("linked")]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(await menuItem("Cursor", "未链接"));

    expect(await screen.findByText("Cursor 已链接")).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("cursor");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the confirm dialog for a dir with content and migrates on confirm", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ internalSkills: ["pdf"], internalOthers: ["README.md"] }),
    ]);
    linkAgentMock.mockResolvedValue([
      result("migrated", { moved: ["pdf"], parkedOthers: ["README.md"] }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(await menuItem("Cursor", "未链接"));

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
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(await menuItem("Cursor", "未链接"));
    await user.click(await screen.findByRole("button", { name: "确认" }));

    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
    expect(
      await screen.findByText("Cursor 已链接（原有文件已备份，取消链接可恢复）"),
    ).toBeInTheDocument();
  });

  it("cancelling the dialog never touches the agent", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([agent({ internalSkills: ["pdf"] })]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(await menuItem("Cursor", "未链接"));
    await user.click(await screen.findByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(linkAgentMock).not.toHaveBeenCalled();
    expect(unlinkAgentMock).not.toHaveBeenCalled();
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
    renderWithRouter(<AgentAvatarMenu />);

    // No dialog for linked agents — the click unlinks and the backend
    // restores the parked dir; the toast reports it.
    await openMenu(user);
    await user.click(await menuItem("Cursor", "已链接"));

    expect(
      await screen.findByText("Cursor 已取消链接（已恢复 1 项备份内容）"),
    ).toBeInTheDocument();
    expect(unlinkAgentMock).toHaveBeenCalledWith("cursor");
    expect(linkAgentMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains why a canonical agent cannot be unlinked", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(await menuItem("Windsurf", "原生"));

    expect(
      await screen.findByText("Windsurf 使用原生 skills 目录，无法取消链接"),
    ).toBeInTheDocument();
    expect(unlinkAgentMock).not.toHaveBeenCalled();
    expect(linkAgentMock).not.toHaveBeenCalled();
  });

  it("shows a refusal (stale backup) as a toast, not a dialog", async () => {
    const user = userEvent.setup();
    linkAgentMock.mockResolvedValue([
      result("refused", {
        message: "a previous backup is still parked at /backup/cursor",
      }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(await menuItem("Cursor", "未链接"));

    expect(
      await screen.findByText(/Cursor 拒绝链接：a previous backup is still parked/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("acts on a folded agent the same way as an inline one", async () => {
    const user = userEvent.setup();
    const total = AVATAR_GROUP_MAX + 3;
    fetchAgentStatusMock.mockResolvedValue(manyAgents(total));
    linkAgentMock.mockResolvedValue([
      result("linked", { agent: "agent-5", display: "Agent 5" }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    // Agent 5 never renders inline, but the menu still reaches it.
    await user.click(await menuItem("Agent 5", "未链接"));

    expect(await screen.findByText("Agent 5 已链接")).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("agent-5");
  });
});
