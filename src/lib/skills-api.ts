import type { Skill } from "../types/skill";
import { fetchFirstStream, fileCandidates } from "./cdn-config";

/**
 * The skills-index repo publishes the full index (JSONL, one object per line)
 * to its `dist` orphan branch. It is fetched through the configurable download
 * source (direct GitHub raw by default, CDN fallback), which sends CORS headers
 * so it is fetchable from the WebView and a plain browser alike.
 */
const INDEX_SPEC = {
  repo: "skill-one/skills-index",
  path: "index.jsonl",
  ref: "dist",
} as const;

/** Number of skills returned per page (matches the previous Rust page size). */
const PAGE_SIZE = 200;

/**
 * The TanStack Query cache key for the registry index. Explore and featured
 * share it so both pages read the same cached download; the trailing version
 * invalidates caches captured with a stale shape (6: the cache now holds
 * `{ skills, complete }` so pages can render while the download streams). The
 * entry is excluded from localStorage persistence in App.tsx (the parsed
 * index is far too large), so it never survives a restart.
 */
export const SKILLS_QUERY_KEY = ["skills", 6] as const;

/** The registry-index shape cached under `SKILLS_QUERY_KEY`. */
export interface SkillsIndexData {
  skills: Skill[];
  /** False while the index download is still streaming in. */
  complete: boolean;
}

/** Raw skill shape as stored in one JSONL index line. */
interface RawSkill {
  source: string;
  skillId: string;
  /** Present in the old skills.sh snapshot; absent in the JSONL index. */
  name?: string;
  installs: number;
  /** Absent on some live index lines despite always being drawn. */
  weeklyInstalls?: number[];
  /** Provided by the JSONL index; may be missing on individual entries. */
  description?: string;
  /** Skill directory inside the repo, e.g. "skills/find-skills". */
  path?: string;
  /** GitHub stars of the source repo; absent on the old skills.sh snapshot. */
  stars?: number;
}

/** A page of skills mapped to the app's Skill model. */
export interface SkillsPage {
  skills: Skill[];
  hasMore: boolean;
  total: number | null;
}

/**
 * Whether a source is a GitHub repo in "owner/repo" form.
 *
 * The index also lists non-GitHub sources (e.g. "open.feishu.cn"), which
 * would otherwise produce broken `https://github.com/<source>.png` avatar URLs
 * and are not addressable repos, so they are filtered out.
 */
function isGitHubRepo(source: string): boolean {
  const parts = source.split("/");
  return (
    parts.length === 2 &&
    parts[0].length > 0 &&
    parts[1].length > 0 &&
    // GitHub usernames never contain a dot; a dot means a domain (e.g.
    // "open.feishu.cn") rather than an owner.
    !parts[0].includes(".")
  );
}

function toSkill(raw: RawSkill): Skill {
  return {
    // The JSONL index has no separate `name` field; the skill name lives in
    // `skillId` (the old skills.sh snapshot still carries both).
    name: raw.name ?? raw.skillId,
    repo: raw.source,
    // The JSONL index exposes descriptions; fall back to an empty placeholder
    // when an entry lacks one so the card layout stays stable.
    description: raw.description ?? "",
    // GitHub stars and install counts are separate metrics; entries missing
    // either (e.g. the old skills.sh snapshot) normalize to 0.
    stars: raw.stars ?? 0,
    downloads: raw.installs ?? 0,
    // The registry records a weekly install series in chronological order;
    // the featured page ranks by the most recent week, its last entry. The
    // field is absent on some index lines, so guard before reading it.
    weeklyInstalls:
      raw.weeklyInstalls && raw.weeklyInstalls.length > 0
        ? raw.weeklyInstalls[raw.weeklyInstalls.length - 1]
        : undefined,
    path: raw.path,
  };
}

/**
 * Parse one JSONL index line into a GitHub skill. Returns null for blank
 * lines, malformed JSON, and entries that are not GitHub repos — the same
 * skips the previous whole-text parse applied.
 */
function parseSkillLine(line: string): Skill | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: RawSkill;
  try {
    raw = JSON.parse(trimmed) as RawSkill;
  } catch {
    return null;
  }
  return isGitHubRepo(raw.source) ? toSkill(raw) : null;
}

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
async function readLines(
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

/** How often partial results are pushed to subscribers while streaming. */
const PROGRESS_INTERVAL_MS = 400;

/**
 * In-flight index download shared by every consumer in the session. `skills`
 * accumulates the lines parsed so far; `listeners` receive throttled
 * cumulative snapshots while the stream runs (and one immediate snapshot —
 * everything parsed so far — when joining a download that already finished).
 */
interface IndexLoad {
  promise: Promise<Skill[]>;
  skills: Skill[];
  listeners: Set<(skills: Skill[]) => void>;
}

let load: IndexLoad | null = null;

function startLoad(): IndexLoad {
  const state: IndexLoad = {
    promise: null as unknown as Promise<Skill[]>,
    skills: [],
    listeners: new Set(),
  };
  state.promise = (async () => {
    let lastNotify = 0;
    const notify = () => {
      if (state.skills.length === 0) return;
      // Leading edge: the very first skills notify immediately so the UI can
      // paint page one while the rest of the file is still in flight.
      const now = Date.now();
      if (now - lastNotify < PROGRESS_INTERVAL_MS) return;
      lastNotify = now;
      const snapshot = [...state.skills];
      for (const listener of state.listeners) listener(snapshot);
    };
    try {
      await fetchFirstStream(fileCandidates({ ...INDEX_SPEC }), async (body) => {
        // A candidate that fails mid-stream restarts the parse from scratch
        // on the next candidate.
        state.skills = [];
        await readLines(body, (line) => {
          const skill = parseSkillLine(line);
          if (skill) {
            state.skills.push(skill);
            notify();
          }
        });
      });
      return state.skills;
    } catch (err: unknown) {
      // Clear the cache so the next call retries, as before.
      load = null;
      throw err;
    }
  })();
  return state;
}

/**
 * Observe the index while it streams in. The listener receives a cumulative
 * snapshot of the skills parsed so far — immediately on subscription (so a
 * page mounting mid-download paints from the current snapshot) and then at
 * most once per progress interval. Returns an unsubscribe function.
 *
 * Starts the download if it has not started; joining an in-flight or finished
 * download never refetches.
 */
export function subscribeIndexProgress(
  listener: (skills: Skill[]) => void,
): () => void {
  load ??= startLoad();
  load.listeners.add(listener);
  if (load.skills.length > 0) listener([...load.skills]);
  const state = load;
  return () => {
    state.listeners.delete(listener);
  };
}

/**
 * Load the full skills index (cached per session; the promise resolves once
 * the stream completes). Exposed for callers that need the whole registry at
 * once — joining installed skills with registry metadata, ranking the
 * featured page, or slicing numbered pages — rather than progressive
 * rendering.
 */
export function fetchFullIndex(): Promise<Skill[]> {
  load ??= startLoad();
  return load.promise;
}

/**
 * Fetch one page (0-indexed) of skills.
 *
 * Downloads the full index once (cached) through the configurable download
 * source, then slices it locally using the configured page size. Caching of
 * page data is delegated to TanStack Query, which owns the freshness window
 * and background revalidation.
 */
export async function fetchSkillsPage(
  page: number,
  pageSize: number = PAGE_SIZE,
): Promise<SkillsPage> {
  const skills = await fetchFullIndex();
  const start = page * pageSize;
  const slice = skills.slice(start, start + pageSize);
  return {
    skills: slice,
    hasMore: start + pageSize < skills.length,
    total: skills.length,
  };
}
