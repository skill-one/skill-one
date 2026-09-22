import { describe, it, expect, vi, afterEach } from "vitest";

import {
  SKILLS_SH_LIMIT,
  isSearchableQuery,
  searchSkillsSh,
} from "./skills-sh";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** A successful JSON response stub. */
function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe("isSearchableQuery", () => {
  it("holds the endpoint's own two-character floor", () => {
    expect(isSearchableQuery("")).toBe(false);
    expect(isSearchableQuery("p")).toBe(false);
    // Surrounding whitespace is not query text.
    expect(isSearchableQuery(" p ")).toBe(false);
    expect(isSearchableQuery("pdf")).toBe(true);
  });
});

describe("searchSkillsSh", () => {
  it("asks the live endpoint and maps hits into the app's skill model", async () => {
    fetchMock.mockResolvedValue(
      ok({
        query: "pdf",
        searchType: "fuzzy",
        skills: [
          {
            id: "anthropics/skills/pdf",
            skillId: "pdf",
            name: "pdf",
            installs: 199323,
            source: "anthropics/skills",
          },
        ],
      }),
    );

    await expect(searchSkillsSh("pdf")).resolves.toEqual([
      {
        // The pair the registry keys a skill by, so a live row dedupes
        // against an indexed one by identity alone.
        name: "pdf",
        repo: "anthropics/skills",
        description: "",
        // The live answer carries no stars — see the module's note.
        stars: 0,
        downloads: 199323,
        url: "https://www.skills.sh/anthropics/skills/pdf",
        // No index entry backs this row, so the card must show no figure
        // rather than blend an absent zero into a real install count.
        storeBacked: false,
      },
    ]);

    // Outside Tauri the request goes through the dev server's proxy, which is
    // what makes it same-origin for a browser.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/skills-sh/api/search?q=pdf&limit=${SKILLS_SH_LIMIT}`,
    );
  });

  it("normalizes a missing install count and drops malformed hits", async () => {
    fetchMock.mockResolvedValue(
      ok({
        skills: [
          { id: "acme/tools/hammer", skillId: "hammer", source: "acme/tools" },
          // No source: not a skill this app can key or install.
          { id: "acme/tools/anvil", skillId: "anvil" },
          "nonsense",
        ],
      }),
    );

    await expect(searchSkillsSh("hammer")).resolves.toEqual([
      {
        name: "hammer",
        repo: "acme/tools",
        description: "",
        stars: 0,
        downloads: 0,
        url: "https://www.skills.sh/acme/tools/hammer",
        storeBacked: false,
      },
    ]);
  });

  it("treats an unexpected body shape as no results", async () => {
    fetchMock.mockResolvedValue(ok({ error: "Query must be at least 2 characters" }));

    await expect(searchSkillsSh("p")).resolves.toEqual([]);
  });

  it("throws on a non-OK answer", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as Response);

    await expect(searchSkillsSh("pdf")).rejects.toThrow("HTTP 429");
  });
});
