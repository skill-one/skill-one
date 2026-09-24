import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { LANGUAGE_STORAGE_KEY } from "../../lib/i18n-content";
import {
  fetchAgentStatus,
  linkAgent,
  unlinkAgent,
} from "../../lib/local-skills";
import type { AgentStatus } from "../../lib/skills-manager";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { AVATAR_GROUP_MAX } from "./agent-avatar-group";

vi.mock("../../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/local-skills")>();
  return {
    ...actual,
    fetchAgentStatus: vi.fn(),
    // The menu itself never links or unlinks; the mocks keep the (unused)
    // dialog paths honest in case a test toggles something by accident.
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

function manyAgents(count: number): AgentStatus[] {
  return Array.from({ length: count }, (_, i) =>
    agent({ name: `agent-${i}`, display: `Agent ${i}` }),
  );
}

/** Open the avatar strip's dropdown menu, the status view of all agents. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /^管理 agent 链接/ }),
  );
}

/**
 * Menu items read as "<display> [pending counts] <state>" — the status dot
 * holds no text, and agents with content in their dir carry badge text between
 * the display name and the state.
 */
const menuItem = (display: string, state: string) =>
  screen.findByRole("menuitem", { name: new RegExp(`${display}.*${state}`) });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // The global setup pins the UI language through the stored preference;
  // clearing storage resets it, so re-pin after the clear.
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");
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
    expect(await menuItem("Cursor", "未链接")).toBeInTheDocument();
    expect(await menuItem("Gemini CLI", "未链接")).toBeInTheDocument();
  });

  it("offers no menu before the agents arrive", async () => {
    fetchAgentStatusMock.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AgentAvatarMenu />);

    // Nothing to report while loading, so the strip's trigger is withheld.
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

describe("AgentAvatarMenu header and pending counts", () => {
  it("shows the total agent count in the header", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue(manyAgents(3));
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);

    expect(await screen.findByText(/共 3 个/)).toBeInTheDocument();
  });

  it("surfaces each agent's pending adopt / quarantine counts", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({
        name: "cursor",
        display: "Cursor",
        internalSkills: ["pdf", "docx"],
        internalOthers: ["README.md"],
      }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);

    const item = await menuItem("Cursor", "未链接");
    expect(within(item).getByText("2 个 skill 待收编")).toBeInTheDocument();
    expect(within(item).getByText("1 项文件待隔离")).toBeInTheDocument();
  });

  it("keeps the item clean when the agent's dir holds nothing", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([agent({})]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);

    const item = await menuItem("Cursor", "未链接");
    expect(within(item).queryByText(/待收编/)).not.toBeInTheDocument();
    expect(within(item).queryByText(/待隔离/)).not.toBeInTheDocument();
  });
});

describe("AgentAvatarMenu settings entry", () => {
  it("opens the settings dialog from the gear and keeps rows inert", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);

    // Rows are status only: selecting one never links or unlinks.
    await user.click(await menuItem("Cursor", "未链接"));
    expect(linkAgentMock).not.toHaveBeenCalled();
    expect(unlinkAgentMock).not.toHaveBeenCalled();

    // The gear is the single control: it opens the per-agent settings dialog.
    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Agent 链接设置")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("switch", { name: "Cursor 链接开关" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("shows a disabled, pinned switch for a canonical agent", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
    ]);
    renderWithRouter(<AgentAvatarMenu />);

    await openMenu(user);
    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    const switchEl = within(dialog).getByRole("switch", {
      name: "Windsurf 链接开关",
    });
    expect(switchEl).toHaveAttribute("aria-checked", "true");
    expect(switchEl).toHaveAttribute("aria-disabled", "true");
  });
});
