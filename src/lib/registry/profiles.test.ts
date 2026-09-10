import { describe, expect, it, vi, afterEach } from "vitest";

import {
  compareProfilesTags,
  newestProfilesTag,
  parseProfileLine,
  readProfiles,
} from "./profiles";
import type { SkillProfile } from "../../types/skill";

describe("compareProfilesTags", () => {
  it("orders batch numbers numerically, not lexically", () => {
    expect(
      compareProfilesTags("dist-2026-09-09-2", "dist-2026-09-09-10"),
    ).toBeLessThan(0);
    expect(
      compareProfilesTags("dist-2026-09-09-10", "dist-2026-09-09-2"),
    ).toBeGreaterThan(0);
  });

  it("orders the bare baseline before its batches", () => {
    // Lexically "dist-2026-09-09" sorts after "dist-2026-09-09-1"; the
    // baseline is really batch 0.
    expect(
      compareProfilesTags("dist-2026-09-09", "dist-2026-09-09-1"),
    ).toBeLessThan(0);
  });

  it("orders dates before batch numbers", () => {
    expect(compareProfilesTags("dist-2026-09-09-9", "dist-2026-09-10")).toBeLessThan(0);
    expect(compareProfilesTags("dist-2026-09-10-3", "dist-2026-09-10-3")).toBe(0);
  });
});

describe("newestProfilesTag", () => {
  it("picks the true newest tag regardless of listing order", () => {
    expect(
      newestProfilesTag([
        "dist-2026-09-09-1",
        "dist-2026-09-10",
        "dist-2026-09-09",
        "dist-2026-09-10-2",
        "dist-2026-09-10-10",
      ]),
    ).toBe("dist-2026-09-10-10");
  });

  it("ignores names that are not dist tags", () => {
    expect(
      newestProfilesTag(["v1.2.3", "main", "dist", "dist-2026", "dist-x"]),
    ).toBe(undefined);
  });
});

describe("parseProfileLine", () => {
  const profile: SkillProfile = {
    domain: "开发编程",
    reason: "面向开发者的技能包检索与安装工具",
    persona: {
      tool: "npx skills",
      role: "技能猎头",
      scene: "你说「这活你不会吧」时,我出门找一个现成的技能装上",
    },
  };

  it("parses a complete line into the app's profile model", () => {
    expect(
      parseProfileLine(
        JSON.stringify({
          id: "vercel-labs/skills/find-skills",
          hash: "abc",
          domain: { domain: profile.domain, reason: profile.reason },
          persona: profile.persona,
        }),
      ),
    ).toEqual({ id: "vercel-labs/skills/find-skills", profile });
  });

  it("keeps a domain-only line and drops empty persona fields", () => {
    const parsed = parseProfileLine(
      JSON.stringify({ id: "acme/repo/slug", domain: { domain: "其他" } }),
    );
    expect(parsed).toEqual({
      id: "acme/repo/slug",
      profile: { domain: "其他", reason: undefined, persona: undefined },
    });
  });

  it.each([
    ["blank line", ""],
    ["malformed JSON", "{nope"],
    ["missing id", JSON.stringify({ domain: { domain: "其他" } })],
    ["non-canonical id", JSON.stringify({ id: "a/b", domain: { domain: "x" } })],
    [
      "dotted owner (a domain, not a GitHub user)",
      JSON.stringify({ id: "a.b/c/s", domain: { domain: "x" } }),
    ],
    ["missing domain", JSON.stringify({ id: "a/b/c" })],
    ["empty domain", JSON.stringify({ id: "a/b/c", domain: { domain: "" } })],
  ])("returns null for %s", (_name, line) => {
    expect(parseProfileLine(line)).toBeNull();
  });
});

describe("readProfiles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses every usable line into a map keyed by the canonical id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            JSON.stringify({
              id: "vercel-labs/skills/find-skills",
              domain: { domain: "开发编程" },
            }),
            "",
            "not json",
            JSON.stringify({ id: "acme/repo/writer", domain: { domain: "内容创作" } }),
          ].join("\n"),
          { status: 200 },
        ),
      ),
    );

    const profiles = await readProfiles("cdn", "dist-2026-09-10");
    expect(profiles.size).toBe(2);
    expect(profiles.get("vercel-labs/skills/find-skills")?.domain).toBe(
      "开发编程",
    );
    expect(profiles.get("acme/repo/writer")?.domain).toBe("内容创作");
  });

  it("throws the typed aggregate error when no candidate serves the file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(readProfiles("cdn", "dist-2026-09-10")).rejects.toThrow(
      /HTTP 404/,
    );
  });
});
