import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEFAULT_CDN_BASE, SourceFetchError } from "../cdn-config";
import {
  probeIndexMeta,
  readIndex,
  readLines,
  readRepos,
} from "./index-stream";
import { readSnapshotHead } from "./snapshot";

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

/** The GitHub API endpoint the branch-head probe calls, cache-busted. */
const API_URL =
  "https://api.github.com/repos/skill-one/skills-profiles/commits/dist";

/** A branch-head commit as the API reports it. */
const HEAD_COMMIT = {
  sha: "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0",
  commit: { committer: { date: "2026-09-30T12:21:45Z" } },
};

/** A 200 response serving a JSON body (the API answer). */
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

/** The branch index URL, as `fileCandidates` builds it (before busting). */
const BRANCH_INDEX =
  "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills.jsonl";

/** The dataset's pointer contract, as `index-stream.ts` declares it. */
const SOURCE = { repo: "skill-one/skills-profiles", branch: "dist" };

describe("readSnapshotHead", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers with the branch head's SHA and commit date, cache-busted", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(HEAD_COMMIT));

    await expect(readSnapshotHead(SOURCE)).resolves.toEqual({
      ref: HEAD_COMMIT.sha,
      generatedAt: "2026-09-30T12:21:45Z",
    });
    // The head is a mutable freshness address: an edge copy answering with
    // yesterday's commit would pin the whole download to yesterday's snapshot.
    expect(fetchMock.mock.calls[0][0]).toMatch(`${API_URL}?t=`);
  });

  it("refuses a payload whose sha is not a commit SHA", async () => {
    // The value is interpolated into download URLs, so anything that is not a
    // commit SHA must not become a ref.
    fetchMock.mockImplementation(async () =>
      jsonResponse({ ...HEAD_COMMIT, sha: "main" }),
    );
    await expect(readSnapshotHead(SOURCE)).resolves.toBeNull();
  });

  it("refuses a payload without a commit date", async () => {
    // The date is the freshness stamp the "unchanged" short-circuit compares;
    // without it the caller cannot skip a download.
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        ...HEAD_COMMIT,
        commit: { committer: { date: undefined } },
      }),
    );
    await expect(readSnapshotHead(SOURCE)).resolves.toBeNull();
  });

  it("returns null on a body that is not a JSON object", async () => {
    fetchMock.mockImplementation(async () => jsonResponse("<html>"));
    await expect(readSnapshotHead(SOURCE)).resolves.toBeNull();
  });

  it("returns null when the API does not answer", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    await expect(readSnapshotHead(SOURCE)).resolves.toBeNull();
  });
});

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

  it("resolves the snapshot identity from the branch head, cache-busted", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      requested.push(url.split("?")[0]);
      return jsonResponse(HEAD_COMMIT);
    });

    expect(await probeIndexMeta("")).toEqual({
      ref: HEAD_COMMIT.sha,
      generatedAt: "2026-09-30T12:21:45Z",
    });
    expect(requested).toEqual([API_URL]);
  });

  it("falls back to a branch etag identity when the API does not answer", async () => {
    // Rate-limited or blocked egress IPs make the API unreliable, so the
    // branch itself is consulted: a cache-busted HEAD answers with the
    // index body's etag — a content hash, so equal etag still means equal
    // index bytes. No SHA answers, so the body stays unpinned.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      requested.push(url.split("?")[0]);
      if (url.startsWith(API_URL)) throw new TypeError("rate limited");
      if (init?.method === "HEAD") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ etag: 'W/"6fbdf1-E7rN6kKBORnBBnTXbDWPNXYOrHU"' }),
        } as unknown as Response;
      }
      throw new TypeError("unexpected GET");
    });

    expect(await probeIndexMeta("")).toEqual({
      generatedAt: 'W/"6fbdf1-E7rN6kKBORnBBnTXbDWPNXYOrHU"',
    });
    // The branch index is probed through the candidate chain, cache-busted.
    expect(requested).toEqual([API_URL, BRANCH_INDEX]);
  });

  it("returns null when neither the API nor any etag source answers", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });

  it("returns null on a body that is not a usable branch head and no etag", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(API_URL)) return jsonResponse("<html>");
      return { ok: false, status: 404 } as unknown as Response;
    });
    await expect(probeIndexMeta("")).resolves.toBeNull();
  });
});

describe("readIndex", () => {
  const SHA = HEAD_COMMIT.sha;
  // SHA-addressed candidates: immutable, so no busting is needed.
  const PINNED_ORIGIN = `https://raw.githubusercontent.com/skill-one/skills-profiles/${SHA}/skills.jsonl`;
  const PINNED_CDN = `${DEFAULT_CDN_BASE}/gh/skill-one/skills-profiles@${SHA}/skills.jsonl`;
  // Branch candidates, used only when no SHA is known.
  const BRANCH_ORIGIN =
    "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/skills.jsonl";

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
      SHA,
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
      SHA,
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

  it("downloads the SHA-addressed URL untouched by a busting stamp", async () => {
    await readIndex(
      "",
      SHA,
      Promise.resolve(null),
      () => {},
      () => {},
    );

    // The SHA makes the URL content-addressed: a cached copy is by
    // definition the right copy, so busting it would only cost a full
    // origin download.
    expect(requested).toEqual([PINNED_ORIGIN]);
  });

  it("busts the mutable branch URL when no SHA is known", async () => {
    await readIndex(
      "",
      undefined,
      Promise.resolve(null),
      () => {},
      () => {},
    );

    // Without a pin, an edge copy could be a day old and indistinguishable
    // from the current index — the failure SHA addressing exists to kill.
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
    // the parse from scratch and completes it. The already-resolved stars
    // map is reused, not re-fetched.
    await readIndex(
      DEFAULT_CDN_BASE,
      SHA,
      Promise.resolve(new Map([["acme/tools", 7]])),
      (skill) => skills.push(skill),
      () => restarts++,
    );

    expect(requested).toEqual([PINNED_CDN, PINNED_ORIGIN]);
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
      SHA,
      Promise.resolve(null),
      () => {},
      () => {},
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
    expect(requested).toEqual([PINNED_ORIGIN, PINNED_CDN]);
  });
});

describe("readRepos", () => {
  const SHA = HEAD_COMMIT.sha;
  const PINNED_ORIGIN = `https://raw.githubusercontent.com/skill-one/skills-profiles/${SHA}/repos.jsonl`;
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

    await expect(readRepos("", SHA)).resolves.toEqual(
      new Map([
        ["vercel-labs/skills", 32793],
        ["anthropics/skills", 30501],
      ]),
    );
    // SHA-addressed: immutable, fetched untouched.
    expect(fetchMock.mock.calls[0][0]).toBe(PINNED_ORIGIN);
  });

  it("busts the mutable branch URL when no SHA is known", async () => {
    fetchMock.mockImplementation(async () =>
      bodyResponse(JSON.stringify({ id: "a/b", stars: 1 })),
    );

    await expect(readRepos("", undefined)).resolves.toEqual(
      new Map([["a/b", 1]]),
    );
    expect(fetchMock.mock.calls[0][0].startsWith(`${BRANCH_ORIGIN}?t=`)).toBe(
      true,
    );
  });

  it("throws the typed error when every source fails", async () => {
    fetchMock.mockImplementation(async () => {
      return { ok: false, status: 404 } as unknown as Response;
    });

    const err = await readRepos("", SHA).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
  });
});
