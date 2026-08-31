import {
  fetchFirstStreamInOrder,
  fileCandidates,
  fetchSignal,
} from "../cdn-config";
import type { Skill } from "../../types/skill";
import { parseSkillLine } from "./parse";

/**
 * Streaming reader for the registry index: picks the freshest download
 * candidate, splits the response body into JSONL lines and hands every
 * parsed skill to the caller. Runs inside the registry worker.
 */

/** The skills-index repo publishes the full index (JSONL) to its `dist` branch. */
const INDEX_SPEC = {
  repo: "skill-one/skills-index",
  path: "index.jsonl",
  ref: "dist",
} as const;

/**
 * Silence allowed between body chunks before the read is treated as stalled.
 * The per-request timeout only guards the response headers, so this is what
 * keeps a dead connection from hanging the load forever.
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

/** Freshness stamp published alongside the index (`index-meta.json`). */
interface IndexMeta {
  generatedAt?: string;
}

/**
 * Resolve the index download candidates: probe each source's
 * `index-meta.json` (~300 B), then order the sources newest-first and turn
 * each index URL into a per-publish versioned one.
 *
 * jsDelivr-style CDNs cache branch-resolved files well beyond one daily
 * publish cycle, so a mirror can keep serving yesterday's index.jsonl while
 * the direct origin is already fresh — observed as every skill card showing
 * 0 stars. Ranking by the meta's `generatedAt` alone is not enough either:
 * a mirror can even serve a *stale body* while its *meta* is fresh (the two
 * files cache independently), so identical stamps would tie and the faster
 * mirror would win with yesterday's bytes. Making the stamp part of the URL
 * fixes that — the CDN's cache key changes with every publish, so a stale
 * body can never impersonate the current version, and the mirror keeps its
 * speed advantage for the common (unchanged) case.
 *
 * Candidates whose meta is missing or unreachable rank below all probed ones
 * in their original relative order and keep their unversioned URL; when
 * nothing could be probed the input order is returned unchanged.
 *
 * `indexUrls` and `metaUrls` are index-aligned `fileCandidates` lists for
 * `index.jsonl` and `index-meta.json` respectively.
 */
async function resolveCandidates(
  indexUrls: string[],
  metaUrls: string[],
): Promise<string[]> {
  const arrival: string[] = [];
  const metas = await Promise.all(
    metaUrls.map(async (metaUrl): Promise<IndexMeta | null> => {
      try {
        const resp = await fetch(metaUrl, { signal: fetchSignal() });
        if (!resp.ok) return null;
        const meta = (await resp.json()) as IndexMeta;
        if (!meta.generatedAt || Number.isNaN(Date.parse(meta.generatedAt))) {
          return null;
        }
        arrival.push(metaUrl);
        return meta;
      } catch {
        return null;
      }
    }),
  );
  if (arrival.length === 0) return indexUrls;
  return indexUrls
    .map((url, i) => {
      const meta = metas[i];
      const versioned = meta
        ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(meta.generatedAt ?? "")}`
        : url;
      return {
        url: versioned,
        score: meta ? Date.parse(meta.generatedAt ?? "") : -1,
        arrival: arrival.indexOf(metaUrls[i]),
        orig: i,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.arrival - b.arrival || a.orig - b.orig,
    )
    .map((entry) => entry.url);
}

/**
 * Stream the index from the freshest source, handing every parsed skill to
 * `onLine`. The CDN base is passed in by the main thread: workers have no
 * `localStorage`, so the user's configured download source cannot be read
 * here. A candidate that fails mid-stream falls back to the next-freshest
 * one, restarting the parse from scratch via `onRestart`.
 */
export async function readIndex(
  cdnBase: string,
  onLine: (skill: Skill) => void,
  onRestart: () => void,
): Promise<void> {
  const indexUrls = fileCandidates(INDEX_SPEC, cdnBase);
  const metaUrls = fileCandidates(
    { ...INDEX_SPEC, path: "index-meta.json" },
    cdnBase,
  );
  await fetchFirstStreamInOrder(
    await resolveCandidates(indexUrls, metaUrls),
    async (body) => {
      onRestart();
      await readLines(body, (line) => {
        const skill = parseSkillLine(line);
        if (skill) onLine(skill);
      });
    },
  );
}
