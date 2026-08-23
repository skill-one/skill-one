import { describe, it, expect, vi, afterEach } from "vitest";

import { invoke } from "@tauri-apps/api/core";

import mockPagesData from "../data/skills-mock.json";
import { fetchSkillsPage } from "./skills-api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const mockPages = mockPagesData as Array<{
  skills: { skillId: string; source: string; name: string; installs: number }[];
  hasMore: boolean;
  total: number | null;
}>;

const rawPage = {
  skills: [
    {
      source: "vercel-labs/skills",
      skillId: "find-skills",
      name: "find-skills",
      installs: 2991984,
      weeklyInstalls: [113781],
    },
  ],
  hasMore: true,
  total: 2,
};

afterEach(() => {
  mockInvoke.mockReset();
  // @ts-expect-error deleting a non-optional property is intentional in tests
  delete window.__TAURI_INTERNALS__;
});

describe("fetchSkillsPage", () => {
  it("fetches via the Tauri command in a Tauri shell", async () => {
    // @ts-expect-error test-only global injection
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValueOnce(rawPage);

    const page = await fetchSkillsPage(0);

    expect(page.skills[0].name).toBe("find-skills");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("fetch_skills_page", { page: 0 });
  });

  it("maps raw fields onto the app Skill model", async () => {
    // @ts-expect-error test-only global injection
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValueOnce(rawPage);

    const skill = (await fetchSkillsPage(0)).skills[0];

    expect(skill.repo).toBe("vercel-labs/skills");
    expect(skill.stars).toBe(2991984);
    expect(skill.description).toBe("");
    expect(skill.name).toBe("find-skills");
  });

  it("serves the static single-page snapshot in a plain browser", async () => {
    expect(mockPages).toHaveLength(1);

    const page0 = await fetchSkillsPage(0);
    // The snapshot holds the first 200 skills from the real JSONL index,
    // all of which are GitHub repos, so nothing is filtered out.
    expect(page0.skills).toHaveLength(200);
    expect(page0.skills[0].name).toBe(mockPages[0].skills[0].name);
    expect(page0.hasMore).toBe(true);
    // `total` reports the full GitHub skill count of the live index.
    expect(page0.total).toBe(9514);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("filters out sources that are not GitHub repos", async () => {
    // @ts-expect-error test-only global injection
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValueOnce({
      skills: [
        { ...rawPage.skills[0] },
        {
          source: "open.feishu.cn",
          skillId: "feishu",
          name: "feishu-docs",
          installs: 10,
          weeklyInstalls: [],
        },
        {
          source: "uizze.com",
          skillId: "uizze",
          name: "uizze",
          installs: 20,
          weeklyInstalls: [],
        },
      ],
      hasMore: true,
      total: 3,
    });

    const page = await fetchSkillsPage(0);

    expect(page.skills).toHaveLength(1);
    expect(page.skills[0].repo).toBe("vercel-labs/skills");
  });

  it("ends pagination past the snapshot", async () => {
    const past = await fetchSkillsPage(1);

    expect(past.skills).toEqual([]);
    expect(past.hasMore).toBe(false);
    expect(past.total).toBeNull();
  });
});
