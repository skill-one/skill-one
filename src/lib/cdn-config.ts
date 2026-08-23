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
 */
export function fileCandidates(spec: FileSpec): string[] {
  const origin = originUrl(spec);
  const defaultCdn = cdnUrl(DEFAULT_CDN_BASE, spec);
  const base = getCdnBase();
  const custom = base ? cdnUrl(base, spec) : null;
  const ordered = custom ? [custom, origin, defaultCdn] : [origin, defaultCdn];
  return [...new Set(ordered)];
}

/** Fetch the text of the first reachable candidate. */
export async function fetchFirstText(
  urls: string[],
): Promise<{ url: string; text: string }> {
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        return { url, text: await resp.text() };
      }
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("无法连接数据源：已尝试直连 GitHub 与 CDN 镜像");
}

/** Resolve the first reachable URL for a file, following the CDN config. */
export async function resolveFileUrl(spec: FileSpec): Promise<string> {
  const { url } = await fetchFirstText(fileCandidates(spec));
  return url;
}
