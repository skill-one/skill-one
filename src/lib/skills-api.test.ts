import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import mockPagesData from "../data/skills-mock.json";

const INDEX_URL =
  "https://raw.githubusercontent.com/skill-one/skills-index/dist/index.jsonl";

const mockPages = mockPagesData as Array<{
  skills: {
    skillId: string;
    source: string;
    name: string;
    installs: number;
    weeklyInstalls: number[];
    description?: string;
    stars?: number;
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
          stars: 29975,
          description: "helps you find skills",
          path: "skills/find-skills",
        }),
      ),
    );

    const skill = (await fetchSkillsPage(0)).skills[0];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(INDEX_URL, {
      signal: expect.anything(),
    });
    expect(skill).toEqual({
      name: "find-skills",
      repo: "vercel-labs/skills",
      description: "helps you find skills",
      stars: 29975,
      downloads: 2991984,
      weeklyInstalls: 113781,
      path: "skills/find-skills",
    });
  });

  it("keeps the most recent week of the weekly install series", async () => {
    const fetchSkillsPage = await freshModule();
    // The series is chronological, so the last entry is the current week; an
    // entry without weekly data surfaces as undefined rather than 0 so the
    // rankings can tell "no data" and "zero installs" apart. Live index lines
    // exist both with an empty series and without the field at all.
    fetchMock.mockResolvedValueOnce(
      ok(
        jsonl(
          {
            source: "owner/repo",
            skillId: "trending",
            installs: 100,
            weeklyInstalls: [30, 20, 50],
          },
          {
            source: "owner/repo",
            skillId: "no-weekly",
            installs: 5,
            weeklyInstalls: [],
          },
          {
            source: "owner/repo",
            skillId: "field-missing",
            installs: 7,
          },
        ),
      ),
    );

    const page = await fetchSkillsPage(0);

    expect(page.skills[0].weeklyInstalls).toBe(50);
    expect(page.skills[1].weeklyInstalls).toBeUndefined();
    expect(page.skills[2].weeklyInstalls).toBeUndefined();
  });

  it("normalizes missing stars/installs to 0", async () => {
    const fetchSkillsPage = await freshModule();
    // Old snapshot entries carry installs but no stars; sparse index entries
    // may lack installs. Both must surface as 0, not undefined.
    fetchMock.mockResolvedValueOnce(
      ok(
        jsonl(
          {
            source: "vercel-labs/skills",
            skillId: "snapshot-entry",
            installs: 42,
            weeklyInstalls: [],
          },
          {
            source: "owner/repo",
            skillId: "sparse-entry",
            weeklyInstalls: [],
            stars: 7,
          },
        ),
      ),
    );

    const page = await fetchSkillsPage(0);

    expect(page.skills).toEqual([
      {
        name: "snapshot-entry",
        repo: "vercel-labs/skills",
        description: "",
        stars: 0,
        downloads: 42,
        path: undefined,
      },
      {
        name: "sparse-entry",
        repo: "owner/repo",
        description: "",
        stars: 7,
        downloads: 0,
        path: undefined,
      },
    ]);
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

  it("falls back to the CDN and clears the cache on total failure, retrying next call", async () => {
    const fetchSkillsPage = await freshModule();
    // Both candidates fail on the first attempt → loadIndex rejects.
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"));
    await expect(fetchSkillsPage(0)).rejects.toThrow();

    // Second attempt (cache cleared) succeeds on the origin.
    fetchMock.mockResolvedValueOnce(
      ok(
        jsonl({
          source: "owner/repo",
          skillId: "pdf",
          installs: 1,
          weeklyInstalls: [],
        }),
      ),
    );
    await expect(fetchSkillsPage(0)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects when every candidate is a non-2xx response", async () => {
    const fetchSkillsPage = await freshModule();
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(fetchSkillsPage(0)).rejects.toThrow(/HTTP 404/);
  });
});
