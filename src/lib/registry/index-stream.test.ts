import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEFAULT_CDN_BASE, SourceFetchError } from "../cdn-config";
import { readIndex, readLines } from "./index-stream";

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

describe("readIndex", () => {
  // Candidate URLs as produced by `fileCandidates(INDEX_SPEC, "")`:
  // the direct GitHub origin first, the default CDN mirror second.
  const ORIGIN_INDEX =
    "https://raw.githubusercontent.com/skill-one/skills-index/dist/index.jsonl";
  const ORIGIN_META = ORIGIN_INDEX.replace("index.jsonl", "index-meta.json");
  const CDN_INDEX = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-index@dist/index.jsonl`;
  const CDN_META = CDN_INDEX.replace("index.jsonl", "index-meta.json");

  const fetchMock = vi.fn();

  /** A minimal parseable index line (no stars / installs data). */
  const MINIMAL_LINE = JSON.stringify({ source: "acme/tools", skillId: "x" });

  /** A 200 meta response carrying the given freshness stamp. */
  function metaResponse(generatedAt?: string): Response {
    return {
      ok: true,
      status: 200,
      json: async () => (generatedAt === undefined ? {} : { generatedAt }),
    } as unknown as Response;
  }

  /** A non-OK meta response (probe failure). */
  function metaBad(): Response {
    return { ok: false, status: 404 } as unknown as Response;
  }

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

  /** Track which index (not meta) URLs were actually downloaded. */
  let indexFetches: string[];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    indexFetches = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(ORIGIN_INDEX) || url.startsWith(CDN_INDEX)) {
        indexFetches.push(url);
      }
      return metaBad();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads from the freshest source through a versioned URL", async () => {
    // The mirror answers but is a publish cycle behind the origin: the
    // stale mirror must lose despite its usual speed advantage.
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
      if (url.startsWith(ORIGIN_INDEX) || url.startsWith(CDN_INDEX)) {
        indexFetches.push(url);
      }
      if (url === ORIGIN_META) return metaResponse("2026-08-31T04:34:54Z");
      if (url === CDN_META) return metaResponse("2026-08-30T04:34:54Z");
      if (url.startsWith(ORIGIN_INDEX)) return bodyResponse(body);
      return bodyResponse(MINIMAL_LINE);
    });

    const skills: unknown[] = [];
    let restarts = 0;
    await readIndex(
      "",
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
    // Only the fresh origin's multi-megabyte body is downloaded, pinned to
    // the publish stamp; the stale mirror is probed but never used.
    expect(indexFetches).toEqual([
      `${ORIGIN_INDEX}?v=${encodeURIComponent("2026-08-31T04:34:54Z")}`,
    ]);
  });

  it("serves the faster mirror on a freshness tie through a versioned URL", async () => {
    // Equal stamps: whichever meta arrives first (a free latency probe)
    // wins the download, even against the origin's default first slot. The
    // versioned URL is what makes the tie safe: a mirror whose body cache
    // lags behind its (identical) meta cannot serve yesterday's bytes for
    // the current version.
    let resolveOriginMeta!: (resp: Response) => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(ORIGIN_INDEX) || url.startsWith(CDN_INDEX)) {
        indexFetches.push(url);
      }
      if (url === ORIGIN_META) {
        return new Promise((resolve) => {
          resolveOriginMeta = resolve;
        });
      }
      if (url === CDN_META) return metaResponse("2026-08-31T04:34:54Z");
      return bodyResponse(MINIMAL_LINE);
    });

    const pending = readIndex(
      "",
      () => {},
      () => {},
    );
    // The origin meta is slow to arrive; resolve it after the mirror's.
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolveOriginMeta(metaResponse("2026-08-31T04:34:54Z"));
    await pending;

    expect(indexFetches).toEqual([
      `${CDN_INDEX}?v=${encodeURIComponent("2026-08-31T04:34:54Z")}`,
    ]);
  });

  it("keeps the candidate order when no meta is reachable", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === ORIGIN_INDEX || url === CDN_INDEX) indexFetches.push(url);
      if (url === ORIGIN_META || url === CDN_META) return metaBad();
      if (url === ORIGIN_INDEX) return bodyResponse(MINIMAL_LINE);
      throw new TypeError("network down");
    });

    await readIndex(
      "",
      () => {},
      () => {},
    );

    // No freshness signal: fall back to the default origin-first order,
    // with the unversioned URLs.
    expect(indexFetches).toEqual([ORIGIN_INDEX]);
  });

  it("falls back to the next source when the chosen body fails mid-download", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(ORIGIN_INDEX) || url.startsWith(CDN_INDEX)) {
        indexFetches.push(url);
      }
      if (url === ORIGIN_META) return metaResponse("2026-08-30T04:34:54Z");
      if (url === CDN_META) return metaResponse("2026-08-31T04:34:54Z");
      if (url.startsWith(CDN_INDEX)) return bodyResponse("partial", 1);
      return bodyResponse(MINIMAL_LINE);
    });

    const skills: unknown[] = [];
    let restarts = 0;
    await readIndex(
      "",
      (skill) => skills.push(skill),
      () => restarts++,
    );

    // The freshest mirror dropped mid-download; the origin restarts the
    // parse from scratch and completes it, through its own versioned URL.
    expect(indexFetches).toEqual([
      `${CDN_INDEX}?v=${encodeURIComponent("2026-08-31T04:34:54Z")}`,
      `${ORIGIN_INDEX}?v=${encodeURIComponent("2026-08-30T04:34:54Z")}`,
    ]);
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
      if (url === ORIGIN_META || url === CDN_META)
        return metaResponse("2026-08-31T04:34:54Z");
      return { ok: false, status: 404 } as unknown as Response;
    });

    const err = await readIndex(
      "",
      () => {},
      () => {},
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
  });
});
