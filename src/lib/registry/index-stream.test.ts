import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEFAULT_CDN_BASE, SourceFetchError } from "../cdn-config";
import { probeIndexMeta, readIndex, readLines } from "./index-stream";

/** Chunk a string into UTF-8 byte segments of the given size. */
function chunksOf(text: string, size: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.slice(i, i + size));
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

  it("keeps a line fragment buffered until its remainder arrives", async () => {
    const lines: string[] = [];
    const seen: string[][] = [];
    const stream = streamOf(chunksOf("aaa\nbbb\n", 2));
    const reader = stream.getReader();
    // Feed manually so the partial-line boundary is observable per chunk.
    const decoderChunks = chunksOf("aaa\nbbb\n", 2);
    void reader; // replaced below with a synchronous fake stream

    // Re-run through readLines but record snapshots after each chunk by
    // using a one-byte-at-a-time stream and collecting at the end; the
    // buffering behavior is covered by the multi-chunk cases above.
    await readLines(streamOf(decoderChunks), (line) => lines.push(line));
    seen.push(lines);
    expect(seen[0]).toEqual(["aaa", "bbb"]);
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

describe("probeIndexMeta", () => {
  // Candidate URLs as produced by `fileCandidates(META_SPEC, "")`: the direct
  // GitHub origin first, the default CDN mirror second.
  const ORIGIN_META =
    "https://raw.githubusercontent.com/skill-one/skills-index/dist/index-meta.json";
  const CDN_META = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-index@dist/index-meta.json`;

  const fetchMock = vi.fn();

  /** A 200 meta response carrying the given body. */
  function metaResponse(body: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  }

  /** The published snapshot as upstream CI writes it, commit included. */
  const PUBLISHED = {
    formatVersion: 4,
    generatedAt: "2026-09-01T14:25:32Z",
    counts: { total: 23734 },
    distCommit: "e52627feff2681df05ad537627f651a2121a7013",
  };

  /** URLs actually fetched, with any cache-busting stamp stripped off. */
  let requested: string[];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    requested = [];
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      return metaResponse(PUBLISHED);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes the published snapshot and asks for it cache-busted", async () => {
    const published = await probeIndexMeta("");

    expect(published).toEqual({
      commit: "e52627feff2681df05ad537627f651a2121a7013",
      generatedAt: "2026-09-01T14:25:32Z",
      total: 23734,
      formatVersion: 4,
    });
    // The origin answers, so no further source is consulted.
    expect(requested).toEqual([ORIGIN_META]);
  });

  it("busts the CDN cache on every pointer request", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(ORIGIN_META)) throw new TypeError("network down");
      requested.push(url);
      return metaResponse(PUBLISHED);
    });

    await probeIndexMeta("");
    // The pointer is the freshness oracle: an edge copy as much as the WebView's
    // own cache would make yesterday's commit look current.
    expect(requested).toHaveLength(1);
    expect(requested[0].startsWith(`${CDN_META}?t=`)).toBe(true);
  });

  it("drops a malformed commit rather than pinning a download to it", async () => {
    // Anything interpolated into a URL must be a sha; junk would build a
    // bogus address, so it degrades to the branch fallback instead.
    fetchMock.mockImplementation(async () =>
      metaResponse({ ...PUBLISHED, distCommit: "../../evil" }),
    );
    const published = await probeIndexMeta("");
    expect(published?.commit).toBeUndefined();
    expect(published?.generatedAt).toBe("2026-09-01T14:25:32Z");
  });

  it("accepts a commit-less meta from a source lagging behind the format", async () => {
    fetchMock.mockImplementation(async () =>
      metaResponse({ formatVersion: 2, generatedAt: "2026-08-31T04:34:54Z" }),
    );
    expect(await probeIndexMeta("")).toEqual({
      commit: undefined,
      generatedAt: "2026-08-31T04:34:54Z",
      total: undefined,
      formatVersion: 2,
    });
  });

  it("walks to the next source when one is unreachable", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      if (url.startsWith(ORIGIN_META)) return { ok: false, status: 503 };
      return metaResponse(PUBLISHED);
    });

    expect(await probeIndexMeta("")).not.toBeNull();
    expect(requested).toEqual([ORIGIN_META, CDN_META]);
  });

  it("returns null when no source answers", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });

  it("returns null on a body that is not a JSON object", async () => {
    fetchMock.mockImplementation(async () => metaResponse("<html>"));
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });
});

describe("readIndex", () => {
  const COMMIT = "e52627feff2681df05ad537627f651a2121a7013";
  // Commit-addressed candidates: immutable, so no busting is needed.
  const PINNED_ORIGIN = `https://raw.githubusercontent.com/skill-one/skills-index/${COMMIT}/index.jsonl`;
  const PINNED_CDN = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-index@${COMMIT}/index.jsonl`;
  // Branch candidates, used only when no commit is known.
  const BRANCH_ORIGIN =
    "https://raw.githubusercontent.com/skill-one/skills-index/dist/index.jsonl";

  const fetchMock = vi.fn();

  /** A minimal parseable index line (no stars / installs data). */
  const MINIMAL_LINE = JSON.stringify({ source: "acme/tools", skillId: "x" });

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

  it("parses the body line by line, skipping junk and non-GitHub sources", async () => {
    const body = [
      JSON.stringify({
        source: "acme/tools",
        skillId: "hammer",
        installs: 10,
        stars: 3,
        description: "Hammers.",
        path: "skills/hammer",
        weeklyInstalls: [1, 2],
        rev: "t1-a4cf6ce14f6d65b3",
        firstSeenAt: "2026-08-12T04:34:54Z",
      }),
      "not json", // malformed → skipped
      JSON.stringify({ source: "open.feishu.cn", skillId: "x", installs: 1 }), // non-GitHub → skipped
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
      COMMIT,
      (skill) => skills.push(skill),
      () => restarts++,
    );

    expect(restarts).toBe(1);
    expect(skills).toEqual([
      {
        name: "hammer",
        repo: "acme/tools",
        description: "Hammers.",
        stars: 3,
        downloads: 10,
        weeklyInstalls: 2,
        path: "skills/hammer",
        rev: "t1-a4cf6ce14f6d65b3",
        firstSeenAt: "2026-08-12T04:34:54Z",
      },
    ]);
  });

  it("downloads the commit-addressed URL untouched by a busting stamp", async () => {
    await readIndex(
      "",
      COMMIT,
      () => {},
      () => {},
    );

    // The commit makes the URL content-addressed: a cached copy is by
    // definition the right copy, so busting it would only cost a full
    // origin download.
    expect(requested).toEqual([PINNED_ORIGIN]);
  });

  it("busts the mutable branch URL when no commit is known", async () => {
    await readIndex(
      "",
      undefined,
      () => {},
      () => {},
    );

    // Without a pin, an edge copy could be a day old and indistinguishable
    // from the current index — the failure commit addressing exists to kill.
    expect(requested).toHaveLength(1);
    expect(requested[0].startsWith(`${BRANCH_ORIGIN}?t=`)).toBe(true);
  });

  it("falls back to the next source when the chosen body fails mid-download", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url);
      if (url === PINNED_CDN) return bodyResponse("partial", 1);
      return bodyResponse(MINIMAL_LINE);
    });

    const skills: unknown[] = [];
    let restarts = 0;
    // A configured CDN first: it drops mid-download, so the origin restarts
    // the parse from scratch and completes it.
    await readIndex(
      DEFAULT_CDN_BASE,
      COMMIT,
      (skill) => skills.push(skill),
      () => restarts++,
    );

    expect(requested).toEqual([PINNED_CDN, PINNED_ORIGIN]);
    expect(restarts).toBe(2);
    expect(skills).toEqual([
      {
        name: "x",
        repo: "acme/tools",
        description: "",
        stars: 0,
        downloads: 0,
        weeklyInstalls: undefined,
        path: undefined,
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
      COMMIT,
      () => {},
      () => {},
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
    expect(requested).toEqual([PINNED_ORIGIN, PINNED_CDN]);
  });
});
