import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import {
  fetchAgentStatus,
  linkAgent,
  removeAgentStrayFiles,
} from "../../lib/local-skills";
import type { AgentLinkResult } from "../../lib/skills-manager";
import { AgentIconGrid } from "./agent-icon-grid";

vi.mock("../../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/local-skills")>();
  return {
    ...actual,
    fetchAgentStatus: vi.fn(),
    linkAgent: vi.fn(),
    unlinkAgent: vi.fn(),
    removeAgentStrayFiles: vi.fn(),
  };
});
vi.mock("../../lib/open-external", () => ({
  openPathInSystem: vi.fn(),
  openExternal: vi.fn(),
}));

const fetchAgentStatusMock = vi.mocked(fetchAgentStatus);
const linkAgentMock = vi.mocked(linkAgent);
const removeAgentStrayFilesMock = vi.mocked(removeAgentStrayFiles);

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

describe("AgentIconGrid link decision dialog", () => {
  it("opens the decision dialog with the strays when a plain 链接 is refused", async () => {
    const user = userEvent.setup();
    linkAgentMock.mockResolvedValue([refused(["README.md"])]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));

    // The dialog lists the strays and offers the actions itself; the refusal
    // never auto-retries with --migrate.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("需先处理的其他文件（1）")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 1 个文件" })).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledTimes(1);
  });

  it("opens the decision dialog from the icon click and migrates from it", async () => {
    const user = userEvent.setup();
    // Skills present → the icon click opens the decision dialog instead of
    // linking, and the import runs from the dialog.
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
    await user.click(
      await screen.findByRole("button", { name: "导入 1 个 skills 并链接" }),
    );

    // The migrate fails on strays → the dialog refreshes with them.
    expect(await screen.findByText("需先处理的其他文件（1）")).toBeInTheDocument();
    expect(screen.getByText("README.txt")).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
  });

  it("auto-links after the strays are deleted from the dialog when no skills remain", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      {
        name: "cursor",
        display: "Cursor",
        linked: false,
        canonical: false,
        internalSkills: [],
        internalFiles: ["README.txt"],
        dirPath: AGENT_DIR,
      },
    ]);
    removeAgentStrayFilesMock.mockResolvedValue(["README.txt"]);
    linkAgentMock.mockResolvedValue([
      {
        agent: "cursor",
        display: "Cursor",
        status: "linked",
        moved: [],
        skipped: [],
        skills: [],
        message: null,
      },
    ]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));
    await user.click(await screen.findByRole("button", { name: "删除 1 个文件" }));
    // Two-step confirm for the irreversible deletion.
    await user.click(screen.getByRole("button", { name: "确认删除？" }));

    // The click intent was to link: with the dir now empty the link follows
    // automatically, without a migrate.
    expect(removeAgentStrayFilesMock).toHaveBeenCalledWith(AGENT_DIR, [
      "README.txt",
    ]);
    const linked = await screen.findByText("Cursor 已链接");
    expect(linked).toBeInTheDocument();
    expect(linkAgentMock).toHaveBeenCalledWith("cursor");
  });

  it("keeps the dialog open for the import step when skills remain after deletion", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      {
        name: "cursor",
        display: "Cursor",
        linked: false,
        canonical: false,
        internalSkills: ["pdf"],
        internalFiles: ["README.txt"],
        dirPath: AGENT_DIR,
      },
    ]);
    removeAgentStrayFilesMock.mockResolvedValue(["README.txt"]);
    renderWithRouter(<AgentIconGrid />);

    await user.click(await screen.findByRole("button", { name: /Cursor，点击链接/ }));
    await user.click(await screen.findByRole("button", { name: "删除 1 个文件" }));
    await user.click(screen.getByRole("button", { name: "确认删除？" }));

    // Skills still await import: the dialog stays open and the import button
    // becomes enabled instead of the blocked placeholder.
    expect(
      await screen.findByRole("button", { name: "导入 1 个 skills 并链接" }),
    ).toBeEnabled();
    expect(linkAgentMock).not.toHaveBeenCalled();
  });
});
