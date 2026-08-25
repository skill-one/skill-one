import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchAgentStatus } from "./local-skills";

const { isTauri, getLinkStatus } = vi.hoisted(() => ({
  isTauri: vi.fn(),
  getLinkStatus: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({
  getLinkStatus,
  linkAgents: vi.fn(),
  unlinkAgents: vi.fn(),
  listInstalledSkills: vi.fn(),
  removeSkills: vi.fn(),
  updateSkills: vi.fn(),
}));

describe("fetchAgentStatus (Tauri)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauri.mockReturnValue(true);
  });

  it("returns internalSkills from the backend without probing", async () => {
    getLinkStatus.mockResolvedValue([
      {
        name: "cursor",
        display: "Cursor",
        linked: false,
        canonical: false,
        internalSkills: ["pdf", "docx"],
      },
    ]);

    const statuses = await fetchAgentStatus();

    expect(getLinkStatus).toHaveBeenCalledWith({ global: true });
    expect(statuses[0]).toMatchObject({
      name: "cursor",
      linked: false,
      internalSkills: ["pdf", "docx"],
    });
  });

  it("returns empty internalSkills for linked/canonical agents", async () => {
    getLinkStatus.mockResolvedValue([
      {
        name: "claude-code",
        display: "Claude Code",
        linked: true,
        canonical: false,
        internalSkills: [],
      },
      {
        name: "windsurf",
        display: "Windsurf",
        linked: false,
        canonical: true,
        internalSkills: [],
      },
    ]);

    const statuses = await fetchAgentStatus();

    expect(statuses).toHaveLength(2);
    expect(statuses[0].internalSkills).toEqual([]);
    expect(statuses[1].internalSkills).toEqual([]);
  });
});
