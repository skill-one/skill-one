import { describe, expect, it, vi, afterEach } from "vitest";

import { parseProfileLine, probeProfilesMeta, readProfiles } from "./profiles";
import type { SkillProfile } from "../../types/skill";

/** The profiles repo's `latest` pointer, as `fileCandidates` builds it. */
const POINTER_ORIGIN =
  "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/latest";

/** The mutable branch's `stats.json`, the degraded probe's source. */
const BRANCH_STATS =
  "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/stats.json";

/** A 200 response serving a plain-text body (the pointer file). */
function textResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as unknown as Response;
}

/** A 200 response serving a JSON body. */
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe("probeProfilesMeta", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Both tag forms the repo publishes: a day's baseline, and a later batch
  // generated on top of it. The pointer names whichever is current.
  it.each(["dist-2026-09-12", "dist-2026-09-12-3"])(
    "resolves %s from the latest pointer and reads the stats pinned to it",
    async (tag) => {
      const requested: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          requested.push(url.split("?")[0]);
          if (url.startsWith(POINTER_ORIGIN)) return textResponse(`${tag}\n`);
          return jsonResponse({
            snapshot: { ref: tag, fetched_at: "2026-09-12T07:22:00Z" },
          });
        }),
      );

      await expect(probeProfilesMeta("")).resolves.toEqual({
        tag,
        generatedAt: "2026-09-12T07:22:00Z",
      });
      // The pointer is busted; the tag-pinned stats are immutable, so the
      // origin answering means the CDN is never asked.
      expect(requested).toEqual([
        POINTER_ORIGIN,
        `https://raw.githubusercontent.com/skill-one/skills-profiles/${tag}/stats.json`,
      ]);
    },
  );

  it("keeps the tag when the pinned stats cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith(POINTER_ORIGIN)
          ? textResponse("dist-2026-09-12")
          : ({ ok: false, status: 404 } as unknown as Response),
      ),
    );

    await expect(probeProfilesMeta("")).resolves.toEqual({
      tag: "dist-2026-09-12",
    });
  });

  it("falls back to the branch stats, unpinned, when the pointer is unreadable", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/latest")) throw new TypeError("network down");
        requested.push(url);
        return jsonResponse({ snapshot: { fetched_at: "2026-09-11T07:22:00Z" } });
      }),
    );

    await expect(probeProfilesMeta("")).resolves.toEqual({
      generatedAt: "2026-09-11T07:22:00Z",
    });
    // Busted: a stale edge copy must not answer for the current publish.
    expect(requested).toHaveLength(1);
    expect(requested[0].startsWith(`${BRANCH_STATS}?t=`)).toBe(true);
  });

  it("returns null when no source answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    await expect(probeProfilesMeta("")).resolves.toBeNull();
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
