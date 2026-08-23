import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import mockPagesData from "../data/skills-mock.json";

const INDEX_URL =
  "https://cdn.jsdmirror.com/gh/luckie2076/skills-index@dist/index.jsonl";

const mockPages = mockPagesData as Array<{
  skills: {
    skillId: string;
    source: string;
    name: string;
    installs: number;
    weeklyInstalls: number[];
    description?: string;
  }[];
}>;

const fetchMock = vi.fn();

/** A successful text response stub. */
function ok(body: string) {
  return { ok: true, status: 200, text: async () => body } as Response;
}

/** JSONL text built from index entries (one JSON object per line). */
function jsonl(...entries: unknown[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}

/** Fresh module import so the index cache does not leak between tests. */
async function freshModule() {
  vi.resetModules();
  const mod = await import("./skills-api");
  return mod.fetchSkillsPage;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("fetchSkillsPage", () => {
  it("downloads the index from JSDMirror and maps raw fields onto the Skill model", async () => {
    const fetchSkillsPage = await freshModule();
    fetchMock.mockResolvedValueOnce(
      ok(
        jsonl({
          source: "vercel-labs/skills",
          skillId: "find-skills",
          installs: 2991984,
          weeklyInstalls: [113781],
          description: "helps you find skills",
          path: "skills/find-skills",
        }),
      ),
    );

    const skill = (await fetchSkillsPage(0)).skills[0];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(INDEX_URL);
    expect(skill).toEqual({
      name: "find-skills",
      repo: "vercel-labs/skills",
      description: "helps you find skills",
      stars: 2991984,
      path: "skills/find-skills",
    });
  });

  it("filters out non-GitHub sources, skips malformed lines and defaults missing descriptions", async () => {
    const fetchSkillsPage = await freshModule();
    fetchMock.mockResolvedValueOnce(
      ok(
        [
          JSON.stringify({
            source: "vercel-labs/skills",
            skillId: "find-skills",
            installs: 1,
            weeklyInstalls: [],
          }),
          JSON.stringify({
            source: "open.feishu.cn",
            skillId: "feishu",
            installs: 10,
            weeklyInstalls: [],
          }),
          "this is not json",
          "",
          JSON.stringify({
            source: "owner/repo",
            skillId: "no-desc",
            installs: 2,
            weeklyInstalls: [],
          }),
        ].join("\n"),
      ),
    );

    const page = await fetchSkillsPage(0);

    expect(page.skills).toHaveLength(2);
    expect(page.skills[0].repo).toBe("vercel-labs/skills");
    expect(page.skills[1].description).toBe("");
    expect(page.total).toBe(2);
  });

  it("slices pages of 200, reports hasMore/total and downloads the index only once", async () => {
    const fetchSkillsPage = await freshModule();
    // 200 snapshot entries plus one extra line → page 0 full, one more page.
    const entries: unknown[] = [
      ...mockPages[0].skills,
      {
        source: "owner/repo",
        skillId: "extra",
        installs: 1,
        weeklyInstalls: [],
      },
    ];
    fetchMock.mockResolvedValueOnce(ok(jsonl(...entries)));

    const page0 = await fetchSkillsPage(0);
    expect(page0.skills).toHaveLength(200);
    expect(page0.skills[0].name).toBe(mockPages[0].skills[0].name);
    expect(page0.hasMore).toBe(true);
    expect(page0.total).toBe(201);

    const page1 = await fetchSkillsPage(1);
    expect(page1.skills).toHaveLength(1);
    expect(page1.skills[0].name).toBe("extra");
    expect(page1.hasMore).toBe(false);

    // The full index is cached and shared across pagination requests.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty page past the end", async () => {
    const fetchSkillsPage = await freshModule();
    fetchMock.mockResolvedValueOnce(ok(jsonl(...mockPages[0].skills)));

    const past = await fetchSkillsPage(1);

    expect(past.skills).toEqual([]);
    expect(past.hasMore).toBe(false);
    expect(past.total).toBe(200);
  });

  it("retries the download after a failure", async () => {
    const fetchSkillsPage = await freshModule();
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        ok(
          jsonl({
            source: "owner/repo",
            skillId: "pdf",
            installs: 1,
            weeklyInstalls: [],
          }),
        ),
      );

    await expect(fetchSkillsPage(0)).rejects.toThrow("network down");
    await expect(fetchSkillsPage(0)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects on a non-2xx response", async () => {
    const fetchSkillsPage = await freshModule();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    await expect(fetchSkillsPage(0)).rejects.toThrow(
      "index request failed: 404",
    );
  });
});
