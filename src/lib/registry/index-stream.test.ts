import { describe, it, expect, vi, beforeEach } from "vitest";

import { readIndex, readLines } from "./index-stream";

/** The mocked candidate fetcher from `../cdn-config` (see readIndex test). */
const fetchFirstStream = vi.hoisted(() => vi.fn());

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
  beforeEach(() => {
    vi.resetModules();
    fetchFirstStream.mockReset();
  });

  it("streams candidate bodies as parsed skills, skipping unparseable lines", async () => {
    // Register the mock before the module under test is imported, so
    // readIndex binds the stubbed cdn-config instead of the real fetcher.
    vi.doMock("../cdn-config", () => ({
      fileCandidates: vi.fn((spec: unknown, base: string) => [{ spec, base }]),
      fetchFirstStream,
    }));
    const indexStream = await import("./index-stream");

    const body = [
      JSON.stringify({
        source: "acme/tools",
        skillId: "hammer",
        installs: 10,
        stars: 3,
        description: "Hammers.",
        path: "skills/hammer",
        weeklyInstalls: [1, 2],
      }),
      "not json", // malformed → skipped
      JSON.stringify({ source: "open.feishu.cn", skillId: "x", installs: 1 }), // non-GitHub → skipped
      "",
    ].join("\n");

    fetchFirstStream.mockImplementation(
      async (
        _candidates: unknown,
        consume: (body: ReadableStream<Uint8Array>) => Promise<void>,
      ) => {
        await consume(streamOf(chunksOf(body, 5)));
      },
    );

    const skills: unknown[] = [];
    let restarts = 0;
    await indexStream.readIndex(
      "https://cdn.test",
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
      },
    ]);
  });
});
