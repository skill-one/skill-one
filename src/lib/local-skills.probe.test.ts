import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchAgentStatus } from "./local-skills";

const {
  isTauri,
  getLinkStatus,
  linkAgents,
  unlinkAgents,
  listInstalledSkills,
  removeSkills,
  updateSkills,
} = vi.hoisted(() => ({
  isTauri: vi.fn(),
  getLinkStatus: vi.fn(),
  linkAgents: vi.fn(),
  unlinkAgents: vi.fn(),
  listInstalledSkills: vi.fn(),
  removeSkills: vi.fn(),
  updateSkills: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({
  getLinkStatus,
  linkAgents,
  unlinkAgents,
  listInstalledSkills,
  removeSkills,
  updateSkills,
}));

function refusedResult(skills: string[]) {
  return {
    agents: ["cursor"],
    results: [
      {
        agent: "cursor",
        display: "Cursor",
        status: "refused",
        moved: [],
        skipped: [],
        skills,
        message: null,
      },
    ],
  };
}

describe("fetchAgentStatus pre-link probe (Tauri)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauri.mockReturnValue(true);
  });

  it("surfaces contained skills when the link is refused", async () => {
    getLinkStatus.mockResolvedValue([
      { name: "cursor", display: "Cursor", linked: false, canonical: false },
    ]);
    linkAgents.mockResolvedValue(refusedResult(["pdf", "docx"]));

    const statuses = await fetchAgentStatus();

    expect(linkAgents).toHaveBeenCalledWith(["cursor"], { global: true });
    expect(unlinkAgents).not.toHaveBeenCalled();
    expect(statuses[0]).toMatchObject({ name: "cursor", linked: false, skills: ["pdf", "docx"] });
  });

  it("reverts the link when the probe linked an empty agent dir", async () => {
    getLinkStatus.mockResolvedValue([
      { name: "gemini-cli", display: "Gemini CLI", linked: false, canonical: false },
    ]);
    linkAgents.mockResolvedValue({
      agents: ["gemini-cli"],
      results: [
        {
          agent: "gemini-cli",
          display: "Gemini CLI",
          status: "linked",
          moved: [],
          skipped: [],
          skills: [],
          message: null,
        },
      ],
    });
    unlinkAgents.mockResolvedValue({
      agents: ["gemini-cli"],
      results: [
        {
          agent: "gemini-cli",
          display: "Gemini CLI",
          status: "unlinked",
          moved: [],
          skipped: [],
          skills: [],
          message: null,
        },
      ],
    });

    const statuses = await fetchAgentStatus();

    expect(unlinkAgents).toHaveBeenCalledWith(["gemini-cli"], { global: true });
    // Agent ends up unlinked so 取消链接 stays effective.
    expect(statuses[0]).toMatchObject({ name: "gemini-cli", linked: false, skills: [] });
  });

  it("does not probe already-linked or canonical agents", async () => {
    getLinkStatus.mockResolvedValue([
      { name: "claude-code", display: "Claude Code", linked: true, canonical: false },
      { name: "windsurf", display: "Windsurf", linked: false, canonical: true },
    ]);

    const statuses = await fetchAgentStatus();

    expect(linkAgents).not.toHaveBeenCalled();
    expect(unlinkAgents).not.toHaveBeenCalled();
    expect(statuses).toHaveLength(2);
  });
});
