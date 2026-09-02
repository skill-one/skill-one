import { describe, it, expect, vi, afterEach } from "vitest";

import { fetchSkillDetail, parseFrontmatter } from "./skill-detail-api";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** A successful text response stub. */
function ok(body: string) {
  return { ok: true, status: 200, text: async () => body } as Response;
}

/** A 404 response stub. */
function notFound() {
  return { ok: false, status: 404 } as Response;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe("parseFrontmatter", () => {
  it("extracts single-line fields and the body, ignoring unmodeled keys", () => {
    const raw = `---
name: pdf
description: "Read and merge PDF documents."
license: MIT
version: 1.2.0
author: 'Anthropic'
---

# Instructions

Use this skill for PDFs.`;

    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({
      name: "pdf",
      description: "Read and merge PDF documents.",
      license: "MIT",
      author: "Anthropic",
    });
    // Deliberate: the registry's content fingerprint, not the author's own
    // version string, is the version identity the detail view shows.
    expect(frontmatter).not.toHaveProperty("version");
    expect(body).toBe("# Instructions\n\nUse this skill for PDFs.");
  });

  it("treats a file without frontmatter as pure body text", () => {
    const { frontmatter, body } = parseFrontmatter("# Just markdown\n\nBody");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just markdown\n\nBody");
  });

  it("parses block scalars, comments and unknown keys per the YAML spec", () => {
    const raw = `---
# a comment
name: pdf
tags: [a, b]
metadata:
  authors:
    - someone
description: >-
  Comprehensive PDF
  processing toolkit
license: 2
---
Body`;

    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({
      name: "pdf",
      description: "Comprehensive PDF processing toolkit",
      license: "2",
    });
  });

  it("preserves line breaks in literal-block descriptions", () => {
    const raw = `---
description: |
  Line one.
  Line two.
---
Body`;

    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.description).toBe("Line one.\nLine two.\n");
  });

  it("falls back to no frontmatter when the YAML is malformed", () => {
    const raw = "---\nname: [unclosed\n---\nBody text";

    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({});
    expect(body).toBe("Body text");
  });

  it("falls back to the whole text when the fence is never closed", () => {
    const { frontmatter, body } = parseFrontmatter("---\nname: pdf\nBody");
    expect(frontmatter).toEqual({});
    expect(body).toBe("---\nname: pdf\nBody");
  });
});

describe("fetchSkillDetail", () => {
  it("fetches the SKILL.md directly from the known index path", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("skills/pdf/SKILL.md")
        ? ok("---\nname: pdf\n---\n\nBody")
        : notFound(),
    );

    const detail = await fetchSkillDetail(
      "anthropics/skills",
      "pdf",
      "skills/pdf",
    );

    expect(detail).toEqual({
      name: "pdf",
      description: "",
      license: undefined,
      author: undefined,
      instructions: "Body",
      path: "skills/pdf/SKILL.md",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/anthropics/skills/HEAD/skills/pdf/SKILL.md",
      { signal: expect.anything() },
    );
  });

  it("strips a trailing slash from the known path", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("skills/pdf/SKILL.md")
        ? ok("---\nname: pdf\n---\n\nBody")
        : notFound(),
    );

    const detail = await fetchSkillDetail(
      "anthropics/skills",
      "pdf",
      "skills/pdf/",
    );

    expect(detail.path).toBe("skills/pdf/SKILL.md");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/anthropics/skills/HEAD/skills/pdf/SKILL.md",
      { signal: expect.anything() },
    );
  });

  it("rejects when the index path is missing", async () => {
    await expect(fetchSkillDetail("anthropics/skills", "pdf")).rejects.toThrow(
      "SKILL.md for pdf not found in anthropics/skills",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the SKILL.md is not found at the known path", async () => {
    fetchMock.mockResolvedValue(notFound());

    await expect(
      fetchSkillDetail("owner/repo", "pdf", "skills/pdf"),
    ).rejects.toThrow("SKILL.md for pdf not found in owner/repo");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/owner/repo/HEAD/skills/pdf/SKILL.md",
      { signal: expect.anything() },
    );
  });

  it("reports the underlying cause on a network failure instead of 'not found'", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));

    await expect(
      fetchSkillDetail("owner/repo", "pdf", "skills/pdf"),
    ).rejects.toThrow(/无法获取 pdf 的 SKILL\.md.*无法连接数据源/);
  });

  it("reports the underlying cause on a server error instead of 'not found'", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 } as Response);

    await expect(
      fetchSkillDetail("owner/repo", "pdf", "skills/pdf"),
    ).rejects.toThrow(/无法获取 pdf 的 SKILL\.md.*HTTP 502/);
  });
});
