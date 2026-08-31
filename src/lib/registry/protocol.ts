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
export type SearchField = "name" | "repo" | "description";

/** One search/browse result: the skill plus what matched, for highlighting. */
export interface SearchHit {
  skill: Skill;
  /**
   * Matched indexed terms per field. Empty outside a search — only search
   * results carry highlight terms.
   */
  matched: Partial<Record<SearchField, readonly string[]>>;
}

/** Explore page sort orders (mirrored by the worker's cached sort). */
export type SortOrder = "default" | "downloads" | "name";

/** Parameters of a paged explore request. */
export interface PageRequest {
  /** Trimmed search text; empty means "browse the registry in order". */
  query: string;
  sort: SortOrder;
  /** 0-based page index. */
  page: number;
  pageSize: number;
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
  /** A `RANKINGS` id, e.g. "weekly". */
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

/** Main-thread → worker messages. */
export type RegistryRequest =
  | { type: "init"; payload: { cdnBase: string } }
  | { type: "reload"; payload: { cdnBase: string } }
  | { type: "getPage"; id: number; payload: PageRequest }
  | { type: "getFeatured"; id: number }
  | { type: "getRanking"; id: number; payload: RankingRequest }
  | { type: "lookupSkills"; id: number; payload: { refs: SkillRef[] } };

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
  | { type: "error"; message: string };

export type RegistryWorkerMessage =
  | RegistryRequest
  | RegistryResponse
  | RegistryEvent;
