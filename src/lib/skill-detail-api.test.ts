import { describe, it, expect, vi, afterEach } from "vitest";

import {
  fetchSkillDetail,
  fetchSkillZhDetail,
  parseFrontmatter,
  zhSkillPath,
} from "./skill-detail-api";
import { setIndexTag } from "./cdn-config";

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
  setIndexTag("");
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
      description: "Read and merge PDF documents.",
      license: "MIT",
      author: "Anthropic",
    });
    // The skill's identity is the registry slug / directory name, never the
    // author-declared frontmatter `name` — so it is not surfaced at all.
    expect(frontmatter).not.toHaveProperty("name");
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
  it("fetches the SKILL.md directly from the known mirror path", async () => {
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
      description: "",
      license: undefined,
      author: undefined,
      instructions: "Body",
      path: "skills/pdf/SKILL.md",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills/pdf/SKILL.md",
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
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills/pdf/SKILL.md",
      { signal: expect.anything() },
    );
  });

  it("pins the fetch to the recorded snapshot tag instead of the dist branch", async () => {
    setIndexTag("dist-2026-09-06");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("skills/pdf/SKILL.md")
        ? ok("---\nname: pdf\n---\n\nBody")
        : notFound(),
    );

    await fetchSkillDetail("anthropics/skills", "pdf", "skills/pdf");

    // The recorded tag is the snapshot the served index was built from, so
    // the SKILL.md body must come from exactly that snapshot.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist-2026-09-06/skills/pdf/SKILL.md",
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
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills/pdf/SKILL.md",
      { signal: expect.anything() },
    );
  });

  it("reports the underlying cause on a network failure instead of 'not found'", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));

    await expect(
      fetchSkillDetail("owner/repo", "pdf", "skills/pdf"),
    ).rejects.toThrow(
      /Unable to fetch SKILL\.md for pdf.*Unable to reach the data source/,
    );
  });

  it("reports the underlying cause on a server error instead of 'not found'", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 } as Response);

    await expect(
      fetchSkillDetail("owner/repo", "pdf", "skills/pdf"),
    ).rejects.toThrow(
      /Unable to fetch SKILL\.md for pdf.*HTTP 502/,
    );
  });
});

describe("zhSkillPath", () => {
  it("maps the index directory to the snapshot's Chinese page path", () => {
    expect(zhSkillPath("skills/vercel-labs/skills/find-skills")).toBe(
      "profiles/vercel-labs/skills/find-skills/skill_zh.md",
    );
  });

  it("tolerates a trailing slash on the index directory", () => {
    expect(zhSkillPath("skills/vercel-labs/skills/find-skills/")).toBe(
      "profiles/vercel-labs/skills/find-skills/skill_zh.md",
    );
  });

  it("answers null for a path the snapshot cannot have a translation for", () => {
    expect(zhSkillPath("profiles/a/b/c")).toBeNull();
    expect(zhSkillPath(undefined)).toBeNull();
  });
});

describe("fetchSkillZhDetail", () => {
  it("fetches the Chinese page from the profiles directory of the snapshot", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("profiles/vercel-labs/skills/find-skills/skill_zh.md")
        ? ok("# 查找技能\n\n中文正文。")
        : notFound(),
    );

    const detail = await fetchSkillZhDetail(
      "vercel-labs/skills",
      "find-skills",
      "skills/vercel-labs/skills/find-skills",
    );

    // The Chinese page ships without frontmatter, so the parsed description
    // is empty and the whole file is the body.
    expect(detail).toEqual({
      description: "",
      license: undefined,
      author: undefined,
      instructions: "# 查找技能\n\n中文正文。",
      path: "profiles/vercel-labs/skills/find-skills/skill_zh.md",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/profiles/vercel-labs/skills/find-skills/skill_zh.md",
      { signal: expect.anything() },
    );
  });

  it("pins the fetch to the recorded snapshot tag", async () => {
    setIndexTag("dist-2026-09-25-9");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("profiles/a/b/c/skill_zh.md") ? ok("正文") : notFound(),
    );

    await fetchSkillZhDetail("a/b", "c", "skills/a/b/c");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist-2026-09-25-9/profiles/a/b/c/skill_zh.md",
      { signal: expect.anything() },
    );
  });

  it("answers null when the snapshot ships no Chinese page", async () => {
    fetchMock.mockResolvedValue(notFound());

    await expect(
      fetchSkillZhDetail("a/b", "c", "skills/a/b/c"),
    ).resolves.toBeNull();
  });

  it("answers null on a network failure instead of throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));

    await expect(
      fetchSkillZhDetail("a/b", "c", "skills/a/b/c"),
    ).resolves.toBeNull();
  });

  it("answers null when there is no index path to derive the page from", async () => {
    await expect(fetchSkillZhDetail("a/b", "c")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
