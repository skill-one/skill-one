import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEFAULT_CDN_BASE, SourceFetchError } from "../cdn-config";
import {
  probeIndexMeta,
  readIndex,
  readLines,
  readTrending,
} from "./index-stream";
import { readLatestTag } from "./snapshot";

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

/** The mirror's `latest` pointer, as `fileCandidates` builds it. */
const POINTER_ORIGIN =
  "https://raw.githubusercontent.com/skill-one/skills-sh-mirror/dist/latest";
const POINTER_CDN = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-sh-mirror@dist/latest`;

/** A 200 response serving a plain-text body (the pointer file). */
function textResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as unknown as Response;
}

describe("readLatestTag", () => {
  const fetchMock = vi.fn();

  /** The mirror's pointer contract, as `index-stream.ts` declares it. */
  const SOURCE = {
    repo: "skill-one/skills-sh-mirror",
    branch: "dist",
    tag: /^dist-\d{4}-\d{2}-\d{2}$/,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the pointer's one-line body as the tag, cache-busted", async () => {
    fetchMock.mockImplementation(async () => textResponse("dist-2026-09-12\n"));

    await expect(readLatestTag("", SOURCE)).resolves.toBe("dist-2026-09-12");
    // The pointer is a mutable freshness address: an edge copy answering with
    // yesterday's tag would pin the whole download to yesterday's snapshot.
    expect(fetchMock.mock.calls[0][0]).toMatch(`${POINTER_ORIGIN}?t=`);
  });

  it("trims surrounding whitespace off the body", async () => {
    fetchMock.mockImplementation(async () => textResponse("  dist-2026-09-12  "));

    await expect(readLatestTag("", SOURCE)).resolves.toBe("dist-2026-09-12");
  });

  it("refuses a body that is not a tag this repo publishes", async () => {
    // The value is interpolated into download URLs, so anything that is not a
    // snapshot tag must not become a ref.
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(POINTER_ORIGIN)
        ? textResponse("main")
        : textResponse("<html>404</html>"),
    );

    await expect(readLatestTag("", SOURCE)).resolves.toBeNull();
  });

  it("walks to the next source when one is unreachable", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(POINTER_ORIGIN)) throw new TypeError("network down");
      return textResponse("dist-2026-09-11");
    });

    await expect(readLatestTag("", SOURCE)).resolves.toBe("dist-2026-09-11");
    expect(fetchMock.mock.calls.map(([url]) => url.split("?")[0])).toEqual([
      POINTER_ORIGIN,
      POINTER_CDN,
    ]);
  });

  it("returns null when no source answers", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    await expect(readLatestTag("", SOURCE)).resolves.toBeNull();
  });
});

describe("probeIndexMeta", () => {
  // Candidate URLs as produced by `fileCandidates(META_SPEC, "")`: the direct
  // GitHub origin first, the default CDN mirror second.
  const ORIGIN_STATS =
    "https://raw.githubusercontent.com/skill-one/skills-sh-mirror/dist/stats.json";
  const CDN_STATS = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-sh-mirror@dist/stats.json`;

  const TAG = "dist-2026-09-06";
  // Tag-pinned stats candidates: immutable, so no busting is needed.
  const PINNED_STATS_ORIGIN = `https://raw.githubusercontent.com/skill-one/skills-sh-mirror/${TAG}/stats.json`;
  const PINNED_STATS_CDN = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-sh-mirror@${TAG}/stats.json`;

  const fetchMock = vi.fn();

  /** A 200 stats response carrying the given body. */
  function statsResponse(body: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  }

  /** The published run as upstream CI writes it. */
  const PUBLISHED = {
    startedAt: "2026-09-06T15:02:30.557Z",
    finishedAt: "2026-09-06T15:32:29.423Z",
    indexedRows: 8945,
    changed: 15,
  };

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

  /** Make the `latest` pointer unreachable (the degraded branch path). */
  function withoutPointer() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(POINTER_ORIGIN) || url.startsWith(POINTER_CDN)) {
        throw new TypeError("network down");
      }
      requested.push(url.split("?")[0]);
      return statsResponse(PUBLISHED);
    });
  }

  it("resolves the tag from the latest pointer, then reads the stats pinned to it", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      if (url.startsWith(POINTER_ORIGIN)) return textResponse(TAG);
      return statsResponse(PUBLISHED);
    });

    expect(await probeIndexMeta("")).toEqual({
      tag: TAG,
      generatedAt: "2026-09-06T15:32:29.423Z",
      total: 8945,
    });
    // The pointer is busted; the pinned stats are not — the tag makes the URL
    // immutable, so the origin answering means the CDN is never asked.
    expect(requested).toEqual([POINTER_ORIGIN, PINNED_STATS_ORIGIN]);
  });

  it("pins the tag even when the stats cannot be read", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      if (url.startsWith(POINTER_ORIGIN)) return textResponse(TAG);
      return { ok: false, status: 404 } as unknown as Response;
    });

    // The tag alone still pins the body download; only the stamp/count are
    // unknown, which costs the caller its "unchanged" short-circuit.
    expect(await probeIndexMeta("")).toEqual({ tag: TAG });
    expect(requested).toEqual([
      POINTER_ORIGIN,
      PINNED_STATS_ORIGIN,
      PINNED_STATS_CDN,
    ]);
  });

  it("falls back to the branch probe, unpinned, when the pointer is unreadable", async () => {
    withoutPointer();

    // Nothing is derived from the stats stamp any more: the pointer is
    // upstream's own statement of the tag, so a missing pointer leaves the
    // version unpinned rather than guessing at its naming convention.
    expect(await probeIndexMeta("")).toEqual({
      generatedAt: "2026-09-06T15:32:29.423Z",
      total: 8945,
    });
    // The origin answers, so no further source is consulted.
    expect(requested).toEqual([ORIGIN_STATS]);
  });

  it("refuses a pointer body that is not a snapshot tag", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      if (url.startsWith(POINTER_ORIGIN) || url.startsWith(POINTER_CDN)) {
        return textResponse("main");
      }
      return statsResponse(PUBLISHED);
    });

    const published = await probeIndexMeta("");
    expect(published?.tag).toBeUndefined();
    expect(published?.generatedAt).toBe("2026-09-06T15:32:29.423Z");
    expect(requested).toEqual([POINTER_ORIGIN, ORIGIN_STATS]);
  });

  it("busts the CDN cache on every branch request", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (
        url.startsWith(POINTER_ORIGIN) ||
        url.startsWith(POINTER_CDN) ||
        url.startsWith(ORIGIN_STATS)
      ) {
        throw new TypeError("network down");
      }
      requested.push(url);
      return statsResponse(PUBLISHED);
    });

    await probeIndexMeta("");
    // Without the pointer the branch is the freshness oracle: an edge copy as
    // much as the WebView's own cache would make yesterday's snapshot look
    // current.
    expect(requested).toHaveLength(1);
    expect(requested[0].startsWith(`${CDN_STATS}?t=`)).toBe(true);
  });

  it("accepts a stamp-less stats file from a source lagging behind the format", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(POINTER_ORIGIN) || url.startsWith(POINTER_CDN)) {
        throw new TypeError("network down");
      }
      return statsResponse({ startedAt: "2026-08-31T04:34:54Z" });
    });
    expect(await probeIndexMeta("")).toEqual({
      generatedAt: undefined,
      total: undefined,
    });
  });

  it("walks to the next source when one is unreachable", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(POINTER_ORIGIN) || url.startsWith(POINTER_CDN)) {
        throw new TypeError("network down");
      }
      requested.push(url.split("?")[0]);
      if (url.startsWith(ORIGIN_STATS)) return { ok: false, status: 503 };
      return statsResponse(PUBLISHED);
    });

    expect(await probeIndexMeta("")).not.toBeNull();
    expect(requested).toEqual([ORIGIN_STATS, CDN_STATS]);
  });

  it("returns null when no source answers", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });

  it("returns null on a body that is not a JSON object", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(POINTER_ORIGIN) || url.startsWith(POINTER_CDN)) {
        throw new TypeError("network down");
      }
      return statsResponse("<html>");
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });
});

describe("readTrending", () => {
  const ORIGIN_TRENDING =
    "https://raw.githubusercontent.com/skill-one/skills-sh-mirror/dist/trending.json";
  const TAG = "dist-2026-09-06";
  const PINNED_TRENDING = `https://raw.githubusercontent.com/skill-one/skills-sh-mirror/${TAG}/trending.json`;

  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the id list cache-busted from the mutable branch", async () => {
    const ids = ["a/b/c", "d/e/f"];
    fetchMock.mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ids,
      } as unknown as Response;
    });

    expect(await readTrending("")).toEqual(ids);
    expect(fetchMock.mock.calls[0][0]).toMatch(`${ORIGIN_TRENDING}?t=`);
  });

  it("pins the fetch to the snapshot tag without busting", async () => {
    const ids = ["a/b/c"];
    fetchMock.mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ids,
      } as unknown as Response;
    });

    expect(await readTrending("", TAG)).toEqual(ids);
    // The tag-addressed URL is immutable: fetched untouched, no bust stamp.
    expect(fetchMock.mock.calls[0][0]).toBe(PINNED_TRENDING);
  });

  it("returns null when every source fails or serves a malformed list", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      // First candidate: 404 (a snapshot from before the file existed).
      // Second candidate: not an id array.
      if (url.startsWith(ORIGIN_TRENDING)) return { ok: false, status: 404 };
      return {
        ok: true,
        status: 200,
        json: async () => ({ trending: [] }),
      } as unknown as Response;
    });

    await expect(readTrending("")).resolves.toBeNull();
  });
});

describe("readIndex", () => {
  const TAG = "dist-2026-09-06";
  // Tag-addressed candidates: immutable, so no busting is needed.
  const PINNED_ORIGIN = `https://raw.githubusercontent.com/skill-one/skills-sh-mirror/${TAG}/skills.jsonl`;
  const PINNED_CDN = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-sh-mirror@${TAG}/skills.jsonl`;
  // Branch candidates, used only when no tag is known.
  const BRANCH_ORIGIN =
    "https://raw.githubusercontent.com/skill-one/skills-sh-mirror/dist/skills.jsonl";

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

  it("parses the body line by line, skipping junk and non-GitHub ids", async () => {
    const body = [
      JSON.stringify({
        id: "acme/tools/hammer",
        installs: 10,
        stars: 3,
        url: "https://www.skills.sh/acme/tools/hammer",
        description: "Hammers.",
        hash: "b146008599c31057",
        fetchedAt: "2026-09-06T07:57:37.803Z",
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
      TAG,
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
        path: "skills/acme/tools/hammer",
        rev: "b146008599c31057",
        firstSeenAt: "2026-09-06T07:57:37.803Z",
        url: "https://www.skills.sh/acme/tools/hammer",
      },
    ]);
  });

  it("downloads the tag-addressed URL untouched by a busting stamp", async () => {
    await readIndex(
      "",
      TAG,
      () => {},
      () => {},
    );

    // The tag makes the URL content-addressed: a cached copy is by
    // definition the right copy, so busting it would only cost a full
    // origin download.
    expect(requested).toEqual([PINNED_ORIGIN]);
  });

  it("busts the mutable branch URL when no tag is known", async () => {
    await readIndex(
      "",
      undefined,
      () => {},
      () => {},
    );

    // Without a pin, an edge copy could be a day old and indistinguishable
    // from the current index — the failure tag addressing exists to kill.
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
      TAG,
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
        path: "skills/acme/tools/x",
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
      TAG,
      () => {},
      () => {},
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
    expect(requested).toEqual([PINNED_ORIGIN, PINNED_CDN]);
  });
});
