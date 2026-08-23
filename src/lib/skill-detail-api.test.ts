import { describe, it, expect, vi, afterEach } from "vitest";

import {
  fetchSkillDetail,
  parseFrontmatter,
  simplifiedSkillId,
} from "./skill-detail-api";

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

/** A successful GitHub API tree response stub. */
function tree(paths: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tree: paths.map((path) => ({ type: "blob", path })),
    }),
  } as Response;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe("parseFrontmatter", () => {
  it("extracts single-line fields, quoted values and the body", () => {
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
      version: "1.2.0",
      author: "Anthropic",
    });
    expect(body).toBe("# Instructions\n\nUse this skill for PDFs.");
  });

  it("treats a file without frontmatter as pure body text", () => {
    const { frontmatter, body } = parseFrontmatter("# Just markdown\n\nBody");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just markdown\n\nBody");
  });

  it("ignores comments, unknown keys and block scalars", () => {
    const raw = `---
# a comment
name: pdf
tags: [a, b]
description: >-
  folded
---
Body`;

    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({ name: "pdf" });
  });

  it("falls back to the whole text when the fence is never closed", () => {
    const { frontmatter, body } = parseFrontmatter("---\nname: pdf\nBody");
    expect(frontmatter).toEqual({});
    expect(body).toBe("---\nname: pdf\nBody");
  });
});

describe("simplifiedSkillId", () => {
  it("drops a leading lowercase word", () => {
    expect(simplifiedSkillId("vercel-react-best-practices")).toBe(
      "react-best-practices",
    );
    expect(simplifiedSkillId("a-b")).toBe("b");
  });

  it("keeps ids without a usable prefix", () => {
    expect(simplifiedSkillId("pdf")).toBeNull();
    expect(simplifiedSkillId("My-Skill")).toBeNull();
    expect(simplifiedSkillId("-x")).toBeNull();
  });
});

describe("fetchSkillDetail", () => {
  it("probes conventional paths on main first", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("skills/pdf/SKILL.md") ? ok("---\nname: pdf\n---\n\nBody") : notFound(),
    );

    const detail = await fetchSkillDetail("anthropics/skills", "pdf");

    expect(detail).toEqual({
      name: "pdf",
      description: "",
      license: undefined,
      version: undefined,
      author: undefined,
      instructions: "Body",
      path: "skills/pdf/SKILL.md",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md",
    );
  });

  it("falls back to the simplified id when the full id misses", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("skills/react-best-practices/SKILL.md")
        ? ok("---\nname: react-best-practices\n---\n\nBody")
        : notFound(),
    );

    const detail = await fetchSkillDetail(
      "vercel-labs/skills",
      "vercel-react-best-practices",
    );

    expect(detail.path).toBe("skills/react-best-practices/SKILL.md");
    // Full-id patterns were tried first, then the simplified id hit.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("falls back to the master branch", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/master/") ? ok("Body without frontmatter") : notFound(),
    );

    const detail = await fetchSkillDetail("owner/repo", "pdf");
    expect(detail.instructions).toBe("Body without frontmatter");
    expect(detail.name).toBe("pdf");
  });

  it("searches the repo tree as a last resort", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.startsWith("https://api.github.com/")) {
        return tree(["README.md", "docs/skills/pdf/SKILL.md"]);
      }
      return u.endsWith("docs/skills/pdf/SKILL.md")
        ? ok("---\nname: pdf\n---\n\nBody")
        : notFound();
    });

    const detail = await fetchSkillDetail("owner/repo", "pdf");
    expect(detail.path).toBe("docs/skills/pdf/SKILL.md");
    expect(detail.instructions).toBe("Body");
  });

  it("rejects when nothing is found anywhere", async () => {
    fetchMock.mockResolvedValue(notFound());

    await expect(fetchSkillDetail("owner/repo", "pdf")).rejects.toThrow(
      "SKILL.md for pdf not found in owner/repo",
    );
  });
});
