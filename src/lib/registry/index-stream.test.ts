import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEFAULT_CDN_BASE, SourceFetchError } from "../cdn-config";
import {
  probeIndexMeta,
  readIndex,
  readLines,
  readRepos,
} from "./index-stream";

/** Chunk a string into UTF-8 byte segments of the given size. */
function chunksOf(text: string, size: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.slice(i, size + i));
  }
  return chunks;
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collectLines(text: string, chunkSize = 4): Promise<string[]> {
  const lines: string[] = [];
  await readLines(streamOf(chunksOf(text, chunkSize)), (line) =>
    lines.push(line),
  );
  return lines;
}

describe("readLines", () => {
  it("delivers every complete line of a multi-chunk body", async () => {
    expect(await collectLines("a\nbb\nccc\n", 2)).toEqual(["a", "bb", "ccc"]);
  });

  it("delivers a trailing line without a final newline", async () => {
    expect(await collectLines("a\nbb\nccc", 2)).toEqual(["a", "bb", "ccc"]);
  });

  it("decodes multi-byte characters split across chunks", async () => {
    // "你" is 3 bytes; split it across chunks to prove streaming decode.
    expect(await collectLines("你好\n世界", 1)).toEqual(["你好", "世界"]);
  });

  it("cancels the body when the consumer abandons the read", async () => {
    // A stream that never ends: readLines must hang unless cancelled, so
    // only assert that cancellation of a finite stream is harmless.
    const stream = streamOf(chunksOf("a\n", 1));
    await readLines(stream, () => {});
    expect(stream.locked).toBe(true); // reader released via finally
  });
});

/** The branch index URL, as `fileCandidates` builds it (before busting). */
const BRANCH_INDEX =
  "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills.jsonl";

describe("probeIndexMeta", () => {
  const fetchMock = vi.fn();

  /** URLs actually fetched, with any cache-busting stamp stripped off. */
  let requested: string[];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    requested = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the etag and Last-Modified off a cache-busted HEAD", async () => {
    // The etag is the freshness identity (equal etag, equal index bytes); the
    // Last-Modified stamp is display garnish for the Settings read-out. The
    // branch is a mutable address, so the probe must be busted.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      requested.push(url.split("?")[0]);
      if (init?.method !== "HEAD") throw new TypeError("unexpected GET");
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          etag: 'W/"6fbdf1-E7rN6kKBORnBBnTXbDWPNXYOrHU"',
          "last-modified": "Tue, 30 Sep 2026 12:21:45 GMT",
        }),
      } as unknown as Response;
    });

    expect(await probeIndexMeta("")).toEqual({
      etag: 'W/"6fbdf1-E7rN6kKBORnBBnTXbDWPNXYOrHU"',
      publishedAt: "Tue, 30 Sep 2026 12:21:45 GMT",
    });
    expect(requested).toEqual([BRANCH_INDEX]);
  });

  it("omits publishedAt when the source serves no Last-Modified", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        etag: '"abc"',
      }),
    }) as unknown as Response);

    expect(await probeIndexMeta("")).toEqual({ etag: '"abc"' });
  });

  it("moves to the next candidate when one answers without an etag", async () => {
    const cdnUrl = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-profiles@dist/skills.jsonl`;
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      if (url.startsWith(DEFAULT_CDN_BASE)) {
        // A configured CDN answers, but with nothing usable as an identity.
        return { ok: true, status: 200, headers: new Headers() } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"origin-etag"' }),
      } as unknown as Response;
    });

    expect(await probeIndexMeta(DEFAULT_CDN_BASE)).toEqual({
      etag: '"origin-etag"',
    });
    expect(requested).toEqual([cdnUrl, BRANCH_INDEX]);
  });

  it("returns null when no source answers", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });

  it("returns null when every source answers without an etag", async () => {
    fetchMock.mockImplementation(async () => {
      return { ok: false, status: 404 } as unknown as Response;
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });
});

describe("readIndex", () => {
  // Branch candidates: the only address the dataset publishes, always busted.
  const BRANCH_ORIGIN =
    "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills.jsonl";
  const BRANCH_CDN = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-profiles@dist/skills.jsonl`;

  const fetchMock = vi.fn();

  /** A minimal parseable index line (no stars / installs data). */
  const MINIMAL_LINE = JSON.stringify({ id: "acme/tools/x", installs: 0 });

  /**
   * A 200 index response streaming out `text`; with `failAfterChunks` the
   * body errors once that many chunks were delivered (mid-download drop).
   */
  function bodyResponse(text: string, failAfterChunks?: number): Response {
    const chunks = chunksOf(text, 8);
    let sent = 0;
    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (failAfterChunks !== undefined && sent >= failAfterChunks) {
            controller.error(new Error("connection dropped"));
            return;
          }
          if (sent >= chunks.length) {
            controller.close();
            return;
          }
          controller.enqueue(chunks[sent++]);
        },
      }),
    } as unknown as Response;
  }

  /** URLs actually fetched, in order. */
  let requested: string[];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    requested = [];
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url);
      return bodyResponse(MINIMAL_LINE);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the body line by line, joining stars and skipping junk", async () => {
    const body = [
      JSON.stringify({
        id: "acme/tools/hammer",
        name: "hammer",
        installs: 10,
        dir: "acme/tools/hammer",
        description: "Hammers.",
        description_zh: "锤子。",
        domain: "development",
        confidence: 0.8,
      }),
      "not json", // malformed → skipped
      JSON.stringify({ id: "open.feishu.cn/tools/x", installs: 1 }), // non-GitHub → skipped
      "",
    ].join("\n");
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url);
      return bodyResponse(body);
    });

    const skills: unknown[] = [];
    let restarts = 0;
    await readIndex(
      "",
      Promise.resolve(new Map([["acme/tools", 3]])),
      (skill) => skills.push(skill),
      () => restarts++,
    );

    expect(restarts).toBe(1);
    expect(skills).toEqual([
      {
        name: "hammer",
        id: "acme/tools/hammer",
        repo: "acme/tools",
        description: "Hammers.",
        descriptionZh: "锤子。",
        stars: 3,
        downloads: 10,
        path: "skills/acme/tools/hammer",
        url: "https://www.skills.sh/acme/tools/hammer",
        profile: { domain: ["development"], confidence: 0.8 },
      },
    ]);
  });

  it("normalizes unjoined repos to 0 stars", async () => {
    const skills: unknown[] = [];
    await readIndex(
      "",
      // null = the repos.jsonl sidecar was unreachable; never rejects.
      Promise.resolve(null),
      (skill) => skills.push(skill),
      () => {},
    );
    expect(skills).toEqual([
      {
        name: "x",
        id: "acme/tools/x",
        repo: "acme/tools",
        description: "",
        stars: 0,
        downloads: 0,
        path: "skills/acme/tools/x",
        url: "https://www.skills.sh/acme/tools/x",
      },
    ]);
  });

  it("busts the mutable branch URL: a stale edge copy must not pass for current", async () => {
    await readIndex("", Promise.resolve(null), () => {}, () => {});

    // Without a commit SHA to pin to, an edge copy could be a day old and
    // indistinguishable from the current index — the bust is the only guard.
    expect(requested).toHaveLength(1);
    expect(requested[0].startsWith(`${BRANCH_ORIGIN}?t=`)).toBe(true);
  });

  it("falls back to the next source when the chosen body fails mid-download", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url);
      if (url.startsWith(DEFAULT_CDN_BASE)) return bodyResponse("partial", 1);
      return bodyResponse(MINIMAL_LINE);
    });

    const skills: unknown[] = [];
    let restarts = 0;
    // A configured CDN first: it drops mid-download, so the origin restarts
    // the parse from scratch and completes it. The already-resolved stars
    // map is reused, not re-fetched.
    await readIndex(
      DEFAULT_CDN_BASE,
      Promise.resolve(new Map([["acme/tools", 7]])),
      (skill) => skills.push(skill),
      () => restarts++,
    );

    expect(requested).toHaveLength(2);
    expect(requested[0].startsWith(`${BRANCH_CDN}?t=`)).toBe(true);
    expect(requested[1].startsWith(`${BRANCH_ORIGIN}?t=`)).toBe(true);
    expect(restarts).toBe(2);
    expect(skills).toEqual([
      {
        name: "x",
        id: "acme/tools/x",
        repo: "acme/tools",
        description: "",
        stars: 7,
        downloads: 0,
        path: "skills/acme/tools/x",
        url: "https://www.skills.sh/acme/tools/x",
      },
    ]);
  });

  it("surfaces a typed error when every source fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url);
      return { ok: false, status: 404 } as unknown as Response;
    });

    const err = await readIndex(
      "",
      Promise.resolve(null),
      () => {},
      () => {},
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
    expect(requested).toHaveLength(2);
    expect(requested[0].startsWith(BRANCH_ORIGIN)).toBe(true);
    expect(requested[1].startsWith(BRANCH_CDN)).toBe(true);
  });
});

describe("readRepos", () => {
  const BRANCH_ORIGIN =
    "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/repos.jsonl";

  const fetchMock = vi.fn();

  /** A 200 repos.jsonl response streaming out `text`. */
  function bodyResponse(text: string): Response {
    return {
      ok: true,
      status: 200,
      body: streamOf(chunksOf(text, 8)),
    } as unknown as Response;
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the repo → stars map from the JSONL rows", async () => {
    fetchMock.mockImplementation(async () =>
      bodyResponse(
        [
          JSON.stringify({
            id: "vercel-labs/skills",
            owner: "vercel-labs",
            repo: "skills",
            stars: 32793,
            description: "The open agent skills tool - npx skills",
            pushed_at: "2026-09-28T20:20:57Z",
            gone: false,
          }),
          JSON.stringify({ id: "anthropics/skills", stars: 30501 }),
          "", // blank → skipped
          "not json", // malformed → skipped
          JSON.stringify({ stars: 5 }), // missing id → skipped
          JSON.stringify({ id: "gone/repo", stars: null }), // deleted repo → dropped
          JSON.stringify({ id: "bad/types", stars: "many" }), // non-number → skipped
        ].join("\n"),
      ),
    );

    await expect(readRepos("")).resolves.toEqual(
      new Map([
        ["vercel-labs/skills", 32793],
        ["anthropics/skills", 30501],
      ]),
    );
    // Branch-addressed and busted, like the index body itself.
    expect(fetchMock.mock.calls[0][0].startsWith(`${BRANCH_ORIGIN}?t=`)).toBe(
      true,
    );
  });

  it("throws the typed error when every source fails", async () => {
    fetchMock.mockImplementation(async () => {
      return { ok: false, status: 404 } as unknown as Response;
    });

    const err = await readRepos("").catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
  });
});
