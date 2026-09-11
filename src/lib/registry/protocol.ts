import type { Skill } from "../../types/skill";
import type { SkillRef } from "../../data/featured-content";
import type { HeroSlide, RankEntry } from "./featured-rankings";

export type { SkillRef };

/**
 * Message contract between the main thread (registry client) and the
 * registry worker. Everything crossing the boundary is plain JSON — skill
 * objects and highlight terms only, never the full registry array.
 */

/** Registry fields a search covers (also the highlight keys). */
export type SearchField = "name" | "repo" | "description" | "domain";

/** One search/browse result: the skill plus what matched, for highlighting. */
export interface SearchHit {
  skill: Skill;
  /**
   * Matched indexed terms per field. Empty outside a search — only search
   * results carry highlight terms.
   */
  matched: Partial<Record<SearchField, readonly string[]>>;
}

/**
 * Explore page sort orders (mirrored by the worker's cached sort). "default"
 * keeps the registry index order — the explore toolbar no longer offers it, but
 * the repo detail page still asks for it. "popularity" orders by the blended
 * installs-and-stars figure the rows display (`lib/popularity.ts`), so the
 * order and the number beside it can never disagree. A non-empty query ignores
 * `sort` entirely and answers in relevance order.
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
   * Exact repo filter ("owner/repo") for the repo detail page. When set the
   * query is ignored: skills are filtered by repo identity instead of being
   * run through the fuzzy search.
   */
  repo?: string;
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

/** Repos-page sort orders (mirrored by the worker's cached aggregation). */
export type RepoSortOrder = "stars" | "skills" | "name";

/** One aggregated source repository, for the repos page. */
export interface RepoInfo {
  /** Source repository in "owner/repo" form. */
  repo: string;
  /** Number of registry skills that live in this repository. */
  skills: number;
  /** GitHub star count of the repository (identical across its skills). */
  stars: number;
}

/** Parameters of a paged repos request. */
export interface ReposRequest {
  /** Trimmed search text matched against the repo name; empty browses all. */
  query: string;
  sort: RepoSortOrder;
  /** 0-based page index. */
  page: number;
  pageSize: number;
}

/** One page of repos results. `total` covers the whole (filtered) list. */
export interface RepoPageData {
  repos: RepoInfo[];
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
   * The `dist-<date>` tag the served snapshot was fetched at; absent when
   * the probe could not derive one and the mutable branch was used.
   */
  tag?: string;
  /** The producing run's `finishedAt` (UTC). */
  generatedAt?: string;
  /** Published row count (`indexedRows`), before any consumer-side filtering. */
  total?: number;
  /**
   * The profiles dataset tag the served skills were decorated from, when
   * known. Immutable address: per-skill profile fetches pin to it.
   */
  profilesTag?: string;
  /** The profiles snapshot's `fetched_at` stamp (UTC), when known. */
  profilesAt?: string;
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
  | { type: "getRepos"; id: number; payload: ReposRequest }
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
