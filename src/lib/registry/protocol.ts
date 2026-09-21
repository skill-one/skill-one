import type { Skill } from "../../types/skill";
import type { SkillRef } from "../../data/featured-content";
import type { HeroSlide, RankEntry } from "./featured-rankings";

export type { SkillRef };

/**
 * Message contract between the main thread (registry client) and the
 * registry worker. Everything crossing the boundary is plain JSON — skill
 * objects and highlight terms only, never the full registry array.
 */

/** One search/browse result: the skill plus what matched, for highlighting. */
export interface SearchHit {
  skill: Skill;
  /**
   * Matched indexed terms in the name. Empty outside a search — only search
   * results carry highlight terms.
   */
  matched: { name?: readonly string[] };
}

/**
 * Explore page sort orders (mirrored by the worker's cached sort). "default"
 * keeps the registry index order — the explore toolbar no longer offers it,
 * but internal registry lookups (e.g. link suggestions) still ask for it.
 * "popularity" orders by the blended installs-and-stars figure the rows
 * display (`lib/popularity.ts`), so the order and the number beside it can
 * never disagree. A non-empty query ignores `sort` entirely and answers in
 * relevance order.
 */
export type SortOrder = "default" | "popularity" | "name";

/** Parameters of a paged explore request. */
export interface PageRequest {
  /** Trimmed search text; empty means "browse the registry in order". */
  query: string;
  sort: SortOrder;
  /** 0-based page index. */
  page: number;
  pageSize: number;
  /**
   * Exact domain filter from the profiles dataset ("开发编程", ...).
   * Undefined browses all; a skill without a profile falls outside every
   * domain. Composes with both the browse and the search paths.
   */
  domain?: string;
}

/** One page of explore results. `total` covers the whole (filtered) list. */
export interface PageData {
  hits: SearchHit[];
  total: number;
}

/** Parameters of the grouped (by repository) explore request. */
/**
 * How the explore list buckets its skills. Each mode carries its own
 * ordering — groups and the skills inside them — so the toolbar offers one
 * choice instead of a grouping plus a sort.
 *
 * - `repo`: one group per `owner/repo`, the store's default view.
 * - `popularity`: the whole registry ranked by the popularity blend, chunked
 *   into fixed-size buckets (`TOP 1-50`, `TOP 51-100`, …).
 * - `domain`: one group per profile domain, unprofiled skills pooled into
 *   「未分类」.
 * - `recency`: reserved for grouping by repository update time. The mirror
 *   does not publish that field yet (its `firstSeenAt` is the snapshot's own
 *   publication date, identical for every skill), so the mode stays out of
 *   the menu until a data source answers it.
 */
export type GroupBy = "repo" | "popularity" | "domain" | "recency";

export interface GroupsRequest {
  /** Trimmed search text; empty means "browse the registry in order". */
  query: string;
  /** The bucketing mode; each mode implies its own ordering. */
  groupBy: GroupBy;
}

/**
 * One group of the grouped answer — skills that share the mode's key — plus
 * the display facts its header shows. The optional fields are mode-specific:
 * `avatarOwner`/`stars` belong to `repo`, `emoji` to `domain`.
 */
export interface Group {
  /** Stable identity for folding state and React keys. */
  key: string;
  /** The header's main line: repo name, bucket range, or domain name. */
  title: string;
  /** The owner whose avatar leads the header (`repo` mode only). */
  avatarOwner?: string;
  /** A category glyph shown in place of an avatar (`domain` mode only). */
  emoji?: string;
  /**
   * The repository's GitHub stars (`repo` mode only). Every skill of a repo
   * is joined against the same `repos.jsonl` row, so the figures agree; the
   * max merely makes that expectation explicit instead of trusting it.
   */
  stars?: number;
  /** The group's skills, in the order the mode's ordering produced. */
  skills: SearchHit[];
}

/**
 * How many groups each offered mode would produce over the same answer —
 * the grouping dropdown annotates its options with these, so the reader can
 * compare the modes before committing to one. `recency` is not offered and
 * not counted.
 */
export interface GroupCounts {
  repo: number;
  popularity: number;
  domain: number;
}

/** The whole grouped answer; no pagination — the page folds groups instead. */
export interface GroupsData {
  groups: Group[];
  /** Total skills across all groups (the pre-grouping hit count). */
  total: number;
  groupCounts: GroupCounts;
}

/** One resolved curated section, with global card indexes for the panel. */
export interface FeaturedSectionData {
  id: string;
  title: string;
  skills: Array<{ skill: Skill; index: number }>;
}

/** Featured page payload, fully computed inside the worker. */
export interface FeaturedData {
  slides: HeroSlide[];
  sections: FeaturedSectionData[];
}

/** Parameters of a leaderboard request. */
export interface RankingRequest {
  /** A `RANKINGS` id, e.g. "trending". */
  rankingId: string;
}

/** One leaderboard, ranked and truncated inside the worker. */
export interface RankingData {
  id: string;
  title: string;
  gradient: string;
  /** Top entries of the leaderboard, at most `RANKING_SIZE`. */
  entries: RankEntry[];
  /** Skills that cleared the ranking floor, ignoring the truncation. */
  total: number;
}

/** One distinct profile domain and how many profiled skills carry it. */
export interface DomainInfo {
  domain: string;
  count: number;
}

/**
 * How the dataset currently served by the worker got here during this run.
 * Surfaced in Settings so a user can tell a real refresh from a cache reuse.
 */
export type IndexOrigin =
  /** A newer snapshot was downloaded (or this was the first cold-start fetch). */
  | "updated"
  /** The published run matches the cached one: the download was skipped. */
  | "unchanged"
  /** Serving the cold-start cache while the revalidation is still in flight. */
  | "cache";

/** Published metadata describing the dataset currently served by the worker. */
export interface IndexInfo {
  /**
   * The `dist-<date>[-N]` tag the served snapshot was fetched at; absent when
   * the probe could not derive one and the mutable branch was used.
   */
  tag?: string;
  /** The producing run's `finishedAt` (UTC). */
  generatedAt?: string;
  /** Published row count (`indexedRows`), before any consumer-side filtering. */
  total?: number;
  /** Origin of the served dataset for this run. */
  origin: IndexOrigin;
  /**
   * When the freshness probe behind this identity completed, in ms since the
   * epoch. Absent on the `cache` origin, which is served before the probe has
   * answered — so consumers can tell "checked, nothing new" from "not checked
   * yet" and re-check only once the last answer has gone stale.
   */
  checkedAt?: number;
}

/** How a cheap freshness check ended. */
export type RevalidateStatus =
  /** A newer index and/or profiles snapshot landed; the store serves it now. */
  | "updated"
  /** The served snapshot is still the published one — nothing changed. */
  | "current"
  /**
   * Freshness could not be established: no probe answered, or the newer
   * snapshot failed to download. Nothing being served was replaced.
   */
  | "unknown";

/** Reply to a `revalidate` command. */
export interface RevalidateResult {
  status: RevalidateStatus;
}

/**
 * Main-thread → worker commands the controller answers on its own schedule
 * (boot, source switch, auto-refresh) rather than synchronously in `handle`.
 */
export type RegistryCommand =
  | { type: "init"; payload: { cdnBase: string } }
  | { type: "reload"; payload: { cdnBase: string } }
  | { type: "revalidate"; id: number };

/** Main-thread → worker queries answered synchronously by `handle`. */
export type RegistryQuery =
  | { type: "getPage"; id: number; payload: PageRequest }
  | { type: "getGroups"; id: number; payload: GroupsRequest }
  | { type: "getFeatured"; id: number }
  | { type: "getRanking"; id: number; payload: RankingRequest }
  | { type: "lookupSkills"; id: number; payload: { refs: SkillRef[] } }
  | { type: "getDomains"; id: number };

/** Everything the main thread can send the worker. */
export type RegistryRequest = RegistryCommand | RegistryQuery;

/** Per-request reply; `data` matches the request that carried the id. */
export type RegistryResponse =
  | { type: "result"; id: number; ok: true; data: unknown }
  | { type: "result"; id: number; ok: false; error: string };

/** Worker → main-thread push events. */
export type RegistryEvent =
  | {
      type: "progress";
      count: number;
      complete: boolean;
      indexing: boolean;
    }
  | { type: "ready" }
  | { type: "index"; info: IndexInfo | null }
  | { type: "error"; message: string };

export type RegistryWorkerMessage =
  | RegistryRequest
  | RegistryResponse
  | RegistryEvent;
