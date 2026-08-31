import { fetchFirstStream, fileCandidates } from "../cdn-config";
import type { Skill } from "../../types/skill";
import { parseSkillLine } from "./parse";

/**
 * Streaming reader for the registry index: races the download candidates,
 * splits the response body into JSONL lines and hands every parsed skill to
 * the caller. Runs inside the registry worker.
 */

/** The skills-index repo publishes the full index (JSONL) to its `dist` branch. */
const INDEX_SPEC = {
  repo: "skill-one/skills-index",
  path: "index.jsonl",
  ref: "dist",
} as const;

/**
 * Silence allowed between body chunks before the read is treated as stalled.
 * `fetchFirstStream` only guards the response headers, so this is what keeps
 * a dead connection from hanging the load forever.
 */
const CHUNK_TIMEOUT_MS = 15_000;

/**
 * Read a response body as decoded text lines, delivering each complete line
 * to `onLine` as it arrives. Decoding uses `TextDecoder`'s streaming mode
 * rather than `TextDecoderStream`, which is missing on older WebKit builds
 * the app still supports.
 */
export async function readLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  type ReadResult = Awaited<ReturnType<typeof reader.read>>;
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await new Promise<ReadResult>(
        (resolve, reject) => {
          const stall = setTimeout(
            () => reject(new Error("response stalled")),
            CHUNK_TIMEOUT_MS,
          );
          reader.read().then(
            (result) => {
              clearTimeout(stall);
              resolve(result);
            },
            (err: unknown) => {
              clearTimeout(stall);
              reject(err);
            },
          );
        },
      );
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Only complete lines are parseable; the trailing fragment stays
      // buffered until its remainder arrives.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    }
    // A final line without a trailing newline is still a line.
    buffer += decoder.decode();
    if (buffer.length > 0) onLine(buffer);
  } finally {
    // Release the connection when abandoning a half-read body (the candidate
    // fallback has moved on to another source).
    reader.cancel().catch(() => {});
  }
}

/**
 * Stream the index from the configured source, handing every parsed skill to
 * `onLine`. The CDN base is passed in by the main thread: workers have no
 * `localStorage`, so the user's configured download source cannot be read
 * here. A candidate that fails mid-stream restarts the parse from scratch
 * via `onRestart`, mirroring the previous whole-text retry behavior.
 */
export async function readIndex(
  cdnBase: string,
  onLine: (skill: Skill) => void,
  onRestart: () => void,
): Promise<void> {
  await fetchFirstStream(fileCandidates(INDEX_SPEC, cdnBase), async (body) => {
    onRestart();
    await readLines(body, (line) => {
      const skill = parseSkillLine(line);
      if (skill) onLine(skill);
    });
  });
}
