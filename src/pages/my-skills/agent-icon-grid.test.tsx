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
  it("shows the dialog, with 打开目录, when a plain 链接 is refused on non-skill files", async () => {
    const user = userEvent.setup();
    linkAgentMock.mockResolvedValue([refused(["README.md"])]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开目录" })).toBeInTheDocument();
    // Strays can't be migrated, so we never auto-retry with --migrate.
    expect(linkAgentMock).toHaveBeenCalledTimes(1);
  });

  it("shows the dialog when a migration fails on non-skill files", async () => {
    const user = userEvent.setup();
    // Skills present → clicking an icon goes down the migrate path.
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

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("README.txt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开目录" })).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
  });
});