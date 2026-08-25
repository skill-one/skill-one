import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { fetchAgentStatus, linkAgent } from "../../lib/local-skills";
import type { AgentLinkResult } from "../../lib/skills-manager";
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
vi.mock("../../lib/open-external", () => ({
  openPathInSystem: vi.fn(),
  openExternal: vi.fn(),
}));

const fetchAgentStatusMock = vi.mocked(fetchAgentStatus);
const linkAgentMock = vi.mocked(linkAgent);

const AGENT_DIR = "/Users/me/.cursor/skills";

function refused(files: string[]): AgentLinkResult {
  return {
    agent: "cursor",
    display: "Cursor",
    status: "refused",
    moved: [],
    skipped: [],
    skills: [],
    message: `${AGENT_DIR} contains non-skill files; move them out and rerun (migrate only moves skill directories): ${files.join(", ")}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAgentStatusMock.mockResolvedValue([
    {
      name: "cursor",
      display: "Cursor",
      linked: false,
      canonical: false,
      internalSkills: [],
    },
  ]);
});

describe("AgentIconGrid stray-files dialog", () => {
  it("shows the guidance dialog when a plain 链接 is refused on non-skill files", async () => {
    const user = userEvent.setup();
    linkAgentMock.mockResolvedValue([refused(["README.md"])]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // The dialog only points at the hover tooltip; the strays list and the
    // 打开目录 action live in the tooltip, not here.
    expect(screen.getByText(/请将鼠标悬停在该图标上/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知道了" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开目录" }),
    ).not.toBeInTheDocument();
    // Strays can't be migrated, so we never auto-retry with --migrate.
    expect(linkAgentMock).toHaveBeenCalledTimes(1);
  });

  it("reopens the guidance dialog when a migrate from the hover tooltip fails on strays", async () => {
    const user = userEvent.setup();
    // Skills present → the icon click opens the link-preview dialog instead of
    // linking, so migration is triggered from the tooltip's 一键导入 action.
    fetchAgentStatusMock.mockResolvedValue([
      {
        name: "cursor",
        display: "Cursor",
        linked: false,
        canonical: false,
        internalSkills: ["pdf"],
      },
    ]);
    linkAgentMock.mockResolvedValue([
      {
        agent: "cursor",
        display: "Cursor",
        status: "failed",
        moved: [],
        skipped: [],
        skills: [],
        message: `cannot migrate ${AGENT_DIR}: non-skill entries: README.txt`,
      },
    ]);
    renderWithRouter(<AgentIconGrid />);

    const cursor = await screen.findByRole("button", { name: /Cursor，点击链接/ });
    await user.hover(cursor);
    await user.click(await screen.findByRole("button", { name: "一键导入" }));
    // Two-step confirm inside the tooltip.
    await user.click(screen.getByRole("button", { name: "确认导入？" }));

    // The migrate fails on strays → the guidance dialog opens again.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知道了" })).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
  });
});