/**
 * Configurable download source for registry files: the skills index, per-skill
 * SKILL.md detail, and single-file skill installs.
 *
 * Default behavior is direct GitHub (`raw.githubusercontent.com`); when it is
 * unreachable the fetch falls back to a default CDN (a jsDelivr mirror, the
 * same host the app already uses). The user can configure a custom CDN base in
 * Settings, which is then tried first (with the direct origin and the default
 * CDN as fallbacks). A configured CDN base is persisted to localStorage.
 */

/** Default CDN mirror of GitHub repo files (jsDelivr mirror, CORS-enabled). */
export const DEFAULT_CDN_BASE = "https://cdn.jsdmirror.com";

const SETTINGS_KEY = "skillone.cdn";

// Persist via `window.localStorage` where available, with an in-memory fallback
// so reads still work in environments without a storage backend (e.g. Vitest's
// node runner). The fallback never throws.
const memory = new Map<string, string>();

function readStored(key: string): string {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key) ?? "";
    }
  } catch {
    // Fall through to the in-memory copy.
  }
  return memory.get(key) ?? "";
}

function writeStored(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // In-memory copy remains the source of truth for this session.
  }
}

/** A file in a GitHub repo: `owner/repo` + path, optionally pinned to a ref. */
export interface FileSpec {
  repo: string;
  path: string;
  /** Explicit ref (branch/tag/commit); omit to use the repo's default branch. */
  ref?: string;
}

/** Read the configured CDN base; empty string means "direct GitHub first". */
export function getCdnBase(): string {
  return readStored(SETTINGS_KEY);
}

/** Persist the configured CDN base (empty = disabled). */
export function setCdnBase(value: string): void {
  writeStored(SETTINGS_KEY, value.trim());
}

/** Direct GitHub raw URL. No ref → default branch (`HEAD`). */
function originUrl({ repo, path, ref }: FileSpec): string {
  return `https://raw.githubusercontent.com/${repo}/${ref ?? "HEAD"}/${path}`;
}

/** jsDelivr-style CDN URL for a base. No ref → default branch (no `@`). */
function cdnUrl(base: string, { repo, path, ref }: FileSpec): string {
  const prefix = ref ? `${repo}@${ref}` : repo;
  return `${base.replace(/\/+$/, "")}/gh/${prefix}/${path}`;
}

/**
 * Candidate URLs in priority order. With no configured CDN: origin first, then
 * the default CDN. With a configured CDN base: that CDN first, then origin and
 * the default CDN. `min` removes duplicates.
 *
 * `baseOverride` replaces the persisted configuration — the registry worker
 * has no `localStorage` access, so the main thread passes the configured
 * base through every download. When omitted the stored value is read live.
 */
export function fileCandidates(
  spec: FileSpec,
  baseOverride?: string,
): string[] {
  const origin = originUrl(spec);
  const defaultCdn = cdnUrl(DEFAULT_CDN_BASE, spec);
  const base = baseOverride ?? getCdnBase();
  const custom = base ? cdnUrl(base, spec) : null;
  const ordered = custom ? [custom, origin, defaultCdn] : [origin, defaultCdn];
  return [...new Set(ordered)];
}

/**
 * Append a unique `t` parameter so the request bypasses every cached copy on
 * the way (WebView HTTP cache, CDN edge).
 *
 * Only for tiny *mutable* pointers whose job is to report freshness — the
 * registry's `index-meta.json`, at ~300 B. Verified against the default CDN,
 * which serves branch files with `stale-while-revalidate` and would otherwise
 * answer with a day-old body straight from the edge. Never apply it to a
 * commit-pinned URL (content-addressed, so already cache-safe) or to any
 * multi-megabyte body, where busting means a full origin download every call.
 */
export function cacheBusted(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

/**
 * Per-request timeout for each candidate. Without it a hanging
 * `raw.githubusercontent.com` connection would stall the whole data layer
 * indefinitely (there is no user-facing cancel), and the CDN fallback would
 * never get its turn.
 */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Abort each request after `FETCH_TIMEOUT_MS`. `AbortSignal.timeout` is
 * unavailable on older WebView/macOS builds; those simply keep the previous
 * no-timeout behavior rather than breaking the fetch entirely.
 */
export function fetchSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined;
}

export type SourceFetchErrorKind = "network" | "http";

/**
 * Thrown by `fetchFirstText` when no candidate URL could serve the file.
 * `kind` lets callers distinguish "the file is not there" (every candidate
 * answered with a non-OK status) from "we could not reach the source" (at
 * least one candidate failed before responding).
 */
export class SourceFetchError extends Error {
  readonly kind: SourceFetchErrorKind;
  /** Status of the last candidate that responded; absent on network failure. */
  readonly status?: number;

  constructor(kind: SourceFetchErrorKind, message: string, status?: number) {
    super(message);
    this.name = "SourceFetchError";
    this.kind = kind;
    this.status = status;
  }
}

/** Shared failure classification for the candidate loops below. */
function sourceFetchError(
  status: number | undefined,
  networkFailure: boolean,
): SourceFetchError {
  return networkFailure
    ? new SourceFetchError(
        "network",
        "无法连接数据源：已尝试直连 GitHub 与 CDN 镜像",
      )
    : new SourceFetchError(
        "http",
        `数据源请求失败（HTTP ${status ?? "未知"}）`,
        status,
      );
}

function throwSourceError(
  status: number | undefined,
  networkFailure: boolean,
): never {
  throw sourceFetchError(status, networkFailure);
}

/** Internal marker: a candidate answered, but with a non-OK status. */
class CandidateStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * Try each candidate URL in order until `attempt` succeeds. The failure
 * bookkeeping is shared: a non-OK answer records its status (HTTP failure),
 * anything else (connection refused, dropped body, ...) marks the run as a
 * network failure — both feed the typed error thrown when every candidate
 * has failed.
 */
async function firstCandidateSuccess<T>(
  urls: string[],
  attempt: (url: string) => Promise<T>,
): Promise<T> {
  let status: number | undefined;
  let networkFailure = false;
  for (const url of urls) {
    try {
      return await attempt(url);
    } catch (err) {
      if (err instanceof CandidateStatusError) {
        status = err.status;
      } else {
        networkFailure = true;
      }
    }
  }
  throwSourceError(status, networkFailure);
}

/** Fetch the text of the first reachable candidate. */
export async function fetchFirstText(
  urls: string[],
): Promise<{ url: string; text: string }> {
  return firstCandidateSuccess(urls, async (url) => {
    const resp = await fetch(url, { signal: fetchSignal() });
    if (!resp.ok) throw new CandidateStatusError(resp.status);
    return { url, text: await resp.text() };
  });
}

/**
 * Try each candidate URL in its given order, handing the first usable
 * response body to `consume` for streaming reads. A candidate that answers
 * non-OK — or whose body fails mid-download, or whose `consume` throws —
 * falls back to the next candidate; the consumer restarts its parse from
 * scratch per attempt. An exhausted list raises the typed aggregate error.
 *
 * The streaming counterpart of `fetchFirstText`, used for the multi-megabyte
 * registry index. Callers order candidates by freshness before handing them
 * over (see the registry index's meta probe), so the requests are made
 * strictly one at a time rather than raced: a stale mirror must not outrun a
 * fresh origin just by answering first. A hanging candidate still cannot
 * stall the walk — the per-request timeout aborts it and the next candidate
 * gets its turn.
 */
export async function fetchFirstStreamInOrder(
  urls: string[],
  consume: (body: ReadableStream<Uint8Array>) => Promise<void>,
): Promise<void> {
  await firstCandidateSuccess(urls, async (url) => {
    const resp = await fetch(url, { signal: fetchSignal() });
    if (!resp.ok || !resp.body) throw new CandidateStatusError(resp.status);
    await consume(resp.body);
  });
}
