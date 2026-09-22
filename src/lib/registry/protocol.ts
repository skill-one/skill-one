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
 * The answer to a name search: matched skills in the index's own relevance
 * order, capped so one reply stays page-sized however broad the query. Browsing
 * is not part of this contract — the explore list is grouped by `getGroups`,
 * and a grouped answer crosses the boundary whole.
 */
export interface SearchData {
  hits: SearchHit[];
}

export interface GroupsRequest {
  /** Trimmed search text; empty means "browse the registry in order". */
  query: string;
}

/**
 * One group of the grouped answer: a repository and the skills it publishes,
 * with the display facts its card shows.
 */
export interface Group {
  /** Stable identity for folding state and React keys. */
  key: string;
  /** The repository, as `owner/repo`. */
  title: string;
  /**
   * The repository's GitHub stars. Every skill of a repo is joined against the
   * same `repos.jsonl` row, so the figures agree; the max merely makes that
   * expectation explicit instead of trusting it.
   */
  stars?: number;
  /** The group's skills, in the order the browse ordering produced. */
  skills: SearchHit[];
}

/** The whole grouped answer; no pagination — the page reveals it instead. */
export interface GroupsData {
  groups: Group[];
  /** Total skills across all groups (the pre-grouping hit count). */
  total: number;
}

/** One resolved curated section, with global card indexes for the panel. */
export interface FeaturedSectionData {
  id: string;
  title: string;
  /** The section's skills, most-installed first. */
  skills: Skill[];
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
  | { type: "searchSkills"; id: number; payload: { query: string } }
  | { type: "getGroups"; id: number; payload: GroupsRequest }
  | { type: "getFeatured"; id: number }
  | { type: "getRanking"; id: number; payload: RankingRequest }
  | { type: "lookupSkills"; id: number; payload: { refs: SkillRef[] } };

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
