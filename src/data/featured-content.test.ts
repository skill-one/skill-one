import { describe, expect, it } from "vitest";

import { FEATURED_CATEGORIES } from "./featured-content";

describe("FEATURED_CATEGORIES", () => {
  it("curates several categories with unique, non-empty ids and titles", () => {
    expect(FEATURED_CATEGORIES.length).toBeGreaterThanOrEqual(2);

    const ids = FEATURED_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of FEATURED_CATEGORIES) {
      expect(category.id.trim()).not.toBe("");
      expect(category.title.trim()).not.toBe("");
    }
  });

  it("references well-formed skills, unique within each category", () => {
    for (const category of FEATURED_CATEGORIES) {
      expect(
        category.skills.length,
        `${category.id} should curate skills`,
      ).toBeGreaterThan(1);

      const keys = category.skills.map((ref) => `${ref.repo}/${ref.name}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const ref of category.skills) {
        // "owner/repo", neither part empty (mirrors isGitHubRepo).
        expect(ref.repo).toMatch(/^[^/.\s]+\/[^/\s]+$/);
        expect(ref.name.trim()).not.toBe("");
      }
    }
  });
});
