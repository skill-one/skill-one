import type { Skill } from "../../types/skill";
import { FEATURED_CATEGORIES } from "../../data/featured-content";
import { popularity } from "../popularity";
import { buildSkillSearch, type SkillSearch } from "../search-skills";
import type {
  DomainInfo,
  FeaturedSectionData,
  IndexInfo,
  PageData,
  PageRequest,
  RankingData,
  RankingRequest,
  RegistryQuery,
  RegistryWorkerMessage,
  RevalidateStatus,
  SearchHit,
  SortOrder,
} from "./protocol";
import type { RegistryCache } from "./cache";
import type { PublishedIndex } from "./index-stream";
import type { ProfilesMeta } from "./profiles";
import type { SkillProfile } from "../../types/skill";
import {
  buildHeroSlides,
  RANKING_SIZE,
  rankSkills,
  rankingById,
} from "./featured-rankings";

/**
 * The registry worker's brain, isolated from the Worker plumbing so the
 * whole service state machine is unit-testable without a real Worker.
 *
 * The controller owns the downloaded registry, the search indexes built over
 * it, and every request the main thread can ask: paged browse/search,
 * featured-page computation, and installed-skill metadata lookups. All
 * answers are page-sized or smaller — the full registry never leaves here.
 */

/** How often partial counts are pushed while the download streams in. */
const PROGRESS_INTERVAL_MS = 400;

/** Descending order on the row metric, so list order and displayed figure agree. */
const byPopularity = (a: Skill, b: Skill): number =>
  popularity(b) - popularity(a);

/** Ascending name order, the alternative toolbar sort. */
const byName = (a: Skill, b: Skill): number => a.name.localeCompare(b.name);

/** The comparator for one of the two non-default toolbar orders. */
const skillComparator = (sort: "popularity" | "name") =>
  sort === "popularity" ? byPopularity : byName;

export interface ControllerDeps {
  /**
   * Read the published snapshot stats: the freshness oracle that decides
   * whether the body needs downloading at all. Null when no source answered.
   */
  probeMeta(cdnBase: string): Promise<PublishedIndex | null>;
  /**
   * Stream the JSONL index, handing every parsed skill to `onLine`. `tag`
   * pins the download to an immutable snapshot; undefined falls back to the
   * mutable branch ref. `onRestart` is called at the start of each candidate
   * attempt so the controller can drop its partial buffer (a failed mid-stream
   * candidate restarts the parse from scratch).
   */
  readIndex(
    cdnBase: string,
    tag: string | undefined,
    stars: Promise<Map<string, number> | null>,
    onLine: (skill: Skill) => void,
    onRestart: () => void,
  ): Promise<void>;
  /**
   * Fetch the trending view's id list (skills.sh's trending rank). Called
   * with the resolved snapshot tag so the leaderboard is read from the same
   * snapshot as the index. Null when unavailable — a garnish, never a
   * download failure.
   */
  readTrending(cdnBase: string, tag?: string): Promise<string[] | null>;
  /**
   * Fetch the repos.jsonl sidecar (GitHub stars, keyed by `{owner}/{repo}`)
   * whose rows join into the parsed skill rows. Called with the resolved
   * snapshot tag so the join table comes from the same snapshot as the
   * index. Null when unavailable — a garnish, never a download failure
   * (unjoined skills simply carry 0 stars).
   */
  readRepos(
    cdnBase: string,
    tag?: string,
  ): Promise<Map<string, number> | null>;
  /**
   * Probe the skills-profiles dataset's published snapshot (its freshness
   * identity). Null when no source answered — the caller then skips the
   * profiles refresh rather than guessing.
   */
  readProfilesMeta(cdnBase: string): Promise<ProfilesMeta | null>;
  /**
   * Fetch the whole profiles index (~100 KB) parsed into a map keyed by the
   * canonical skills.sh id. Throws when no candidate could serve the file;
   * like trending, a failure trims the garnish, never the dataset.
   */
  readProfiles(
    cdnBase: string,
    tag: string | undefined,
  ): Promise<Map<string, SkillProfile>>;
  /** Cold-start cache; every method may silently no-op. */
  cache: RegistryCache;
  /** Clock for progress throttling, injectable for tests. */
  now(): number;
}

interface RegistryStats {
  count: number;
  complete: boolean;
  indexing: boolean;
  ready: boolean;
  /** Identity of the snapshot being served; null while nothing is loaded. */
  index: IndexInfo | null;
}

export function createRegistryController(
  deps: ControllerDeps,
  post: (message: RegistryWorkerMessage) => void,
) {
  let cdnBase = "";
  let bootStarted = false;
  // Bumped on every init/reload; responses from a superseded download are
  // dropped instead of clobbering newer data.
  let generation = 0;
  // The producing run (`finishedAt`) the served `store` was built from. A
  // probed run equal to this one means equal bytes, so the download is
  // skipped; undefined until a download records one (a cold-start cache
  // written before run addressing counts as unknown, so it always
  // re-downloads once).
  let servedGeneratedAt: string | undefined;
  // skills.sh's trending rank, as an id list fetched alongside the index.
  // Null while unavailable; superseded downloads never write it (gen guard).
  let trendingIds: string[] | null = null;
  // The profiles dataset (skills-profiles), as a map keyed by the canonical
  // skills.sh id. Null while unavailable — every skill then simply carries
  // no profile. Held across downloads so a fresh store can be decorated
  // from the previous snapshot's map before the refresh resolves.
  let profilesMap: Map<string, SkillProfile> | null = null;
  // Which ids that map can answer for. Null once the published snapshot itself
  // has been read (it answers for every id); a set when the map was recovered
  // from the cold-start cache, which stores decorated skills rather than the
  // dataset behind them — it can only speak for the ids it carried, so a body
  // bringing new ones still has to read the file.
  let profilesAnsweredFor: Set<string> | null = null;
  // The profiles snapshot stamp (`publishedAt`) the decorated skills were
  // built from; undefined until one is served. An equal probed stamp means
  // equal bytes, so the profiles download is skipped.
  let servedProfilesAt: string | undefined;
  // The immutable tag the profiles files were fetched at, surfaced through
  // the index event so per-skill profile fetches can pin to the same
  // snapshot. Undefined when the fetch was not pinned.
  let servedProfilesTag: string | undefined;
  // Last announced snapshot identity, kept for `stats()` and for tests.
  let indexInfo: IndexInfo | null = null;

  // The array every query reads. During a fresh (non-revalidating) download
  // it points at the growing buffer, so paged browse and lookups see the
  // loaded prefix while the stream is still in flight. Search is the one
  // exception: it waits for the index over the settled dataset (see getPage).
  let store: Skill[] = [];
  let complete = false;
  let ready = false; // complete AND search index built
  let search: SkillSearch | null = null;

  // Monotonic progress count: a candidate that fails mid-stream restarts the
  // parse from scratch, and those early snapshots must not walk the sidebar
  // badge backwards.
  let announcedCount = 0;
  let lastNotify = 0;

  // Sort orders are cached per data version: navigating pages of a multi-
  // thousand-entry sorted list re-slices but never re-sorts.
  let dataVersion = 0;
  let orderCache: { version: number; sort: SortOrder; ids: number[] } | null =
    null;
  // Lookup index for `lookupSkills`, cached per data version: resolving each
  // ref by a `store.find` is O(n·m), so instead the earliest matching skill
  // per key is indexed once and every request is a pair of map reads.
  let lookupCache: { version: number; map: Map<string, Skill> } | null = null;
  // Distinct profile domains with their skill counts, cached per data
  // version like the repo aggregation (a single O(n) pass per dataset).
  let domainCache: { version: number; domains: DomainInfo[] } | null = null;

  /**
   * Drop every derived cache and bump the data version they are addressed
   * by, so the next query rebuilds against the dataset now being served.
   */
  const invalidateDerived = () => {
    dataVersion++;
    orderCache = null;
    lookupCache = null;
    domainCache = null;
  };

  const emitProgress = () => {
    post({
      type: "progress",
      count: announcedCount,
      complete,
      indexing: complete && !ready,
    });
  };

  /** Announce the snapshot identity now being served. */
  const emitIndex = (info: IndexInfo) => {
    indexInfo = info;
    post({ type: "index", info });
  };

  const notifyThrottled = (count: number) => {
    if (count <= announcedCount) return;
    // Leading edge: the very first skills notify immediately so the UI can
    // paint page one while the rest of the file is still in flight.
    const now = deps.now();
    if (lastNotify !== 0 && now - lastNotify < PROGRESS_INTERVAL_MS) return;
    lastNotify = now;
    announcedCount = count;
    emitProgress();
  };

  const buildIndex = () => {
    // Hundreds of milliseconds for the ~9k-entry snapshot — acceptable inside
    // the worker, which is exactly why it lives here and not on the main
    // thread.
    search = buildSkillSearch(store);
    ready = true;
    emitProgress();
    post({ type: "ready" });
  };

  /** The canonical id a skill is profiled under: `{owner}/{repo}/{slug}`. */
  const profileId = (skill: Pick<Skill, "repo" | "name">): string =>
    `${skill.repo}/${skill.name}`;

  /**
   * Recover a profiles map from skills that already carry them. The cold-start
   * cache stores decorated skills, not the dataset that decorated them, so
   * without this the held map is empty on a launch that then downloads a newer
   * body: `decorate` has nothing to re-apply, and every skill comes back with
   * the stars and downloads that ride on the index but with no domain — a card
   * with a popularity figure and no classification chip.
   */
  const profilesOf = (skills: readonly Skill[]): Map<string, SkillProfile> => {
    const map = new Map<string, SkillProfile>();
    for (const skill of skills) {
      if (skill.profile) map.set(profileId(skill), skill.profile);
    }
    return map;
  };

  /**
   * Whether the held map can answer for every skill being served. The guard
   * behind "the published snapshot is already served": a probed stamp that
   * matches only means the bytes are the ones we once read — not that we still
   * hold them, nor that they cover a body that has since grown.
   */
  const profilesAnswerEvery = (): boolean => {
    if (!profilesMap) return false;
    const answered = profilesAnsweredFor;
    if (answered == null) return true;
    return store.every((skill) => answered.has(profileId(skill)));
  };

  /**
   * Merge the held profiles map into the served skills. The canonical id is
   * `{owner}/{repo}/{slug}`, i.e. exactly `repo/name` — a plain map read per
   * skill, so re-decorating the whole registry costs one O(n) pass. Skills
   * without a profile are stripped of any stale one (a re-decorate after a
   * dataset change must not leave ghosts behind).
   */
  const decorate = () => {
    if (!profilesMap) return;
    for (const skill of store) {
      const profile = profilesMap.get(`${skill.repo}/${skill.name}`);
      if (profile) skill.profile = profile;
      else delete skill.profile;
    }
  };

  /**
   * Bring the served profiles up to date. The published snapshot is probed
   * for its stamp; only a differing one downloads the ~100 KB index, which
   * is then merged into the served skills. Runs after every dataset landing
   * *and* on the "unchanged" short-circuit — the profiles dataset moves on
   * its own schedule, independent of the registry index it decorates.
   *
   * Like trending, this is garnish: a probe or download failure keeps
   * whatever is being served (nothing, on a fresh boot) and never fails the
   * registry download itself. A successful refresh bumps the data version
   * and rebuilds the search index so the new domains are searchable — the
   * re-posted `ready` bumps the main thread's epoch, which invalidates its
   * cached pages.
   */
  const loadProfiles = async (gen: number, force: boolean): Promise<boolean> => {
    const meta = await deps.readProfilesMeta(cdnBase).catch(() => null);
    if (gen !== generation) return false;
    if (
      !force &&
      profilesAnswerEvery() &&
      meta?.generatedAt !== undefined &&
      meta.generatedAt === servedProfilesAt
    ) {
      // The published snapshot is the one already served *and* the held map
      // still answers for every skill being served: nothing to re-read. A
      // recovered map that no longer covers the store — a newer registry body
      // brought ids the cache never had — falls through to the download, which
      // is the only way to learn what those new skills were profiled as.
      return false;
    }
    let map: Map<string, SkillProfile>;
    try {
      map = await deps.readProfiles(cdnBase, meta?.tag);
    } catch {
      // Unreachable or malformed: keep serving what is already decorated.
      return false;
    }
    if (gen !== generation) return false;
    profilesMap = map;
    // The whole published snapshot: it answers for every id, so the check above
    // no longer has to compare against a recovered subset.
    profilesAnsweredFor = null;
    servedProfilesAt = meta?.generatedAt;
    servedProfilesTag = meta?.tag;
    decorate();
    invalidateDerived();
    if (ready) buildIndex();
    return true;
  };

  /**
   * Bring the served dataset up to date. The published snapshot is probed
   * first (its tag listed, then the ~300 B stats read pinned to that tag);
   * only a differing run downloads the body, which is then streamed into a
   * fresh buffer while any data already being served (cold-start cache,
   * previous source) stays visible and queryable — a revalidation never
   * blanks the UI.
   *
   * The trending id list is fetched once the tag is known, so its latency
   * hides inside the multi-megabyte body download; it is awaited before
   * `ready` is announced, so featured/ranking queries never race it. Its
   * failure only trims the trending leaderboard, never the dataset.
   *
   * `force` skips the "unchanged" short-circuit: a source switch or a user
   * retry must re-download even when the published run has not moved.
   *
   * `probed` lets a caller that already read the published stats hand the
   * answer in, so the freshness probe is never paid for twice (the check
   * behind `revalidate`). Omit it to probe here, as boot and reload do.
   */
  const download = async (
    gen: number,
    force = false,
    probed?: PublishedIndex | null,
  ) => {
    // Null means no source answered: nothing to pin, nothing to compare.
    const published =
      probed !== undefined ? probed : await deps.probeMeta(cdnBase);
    if (gen !== generation) return;
    const tag = published?.tag;
    // Started before the body download so its latency hides inside it; the
    // result is only assigned at the landing points below, so an early
    // resolution can never be clobbered by the partial-buffer reset.
    const trending = deps.readTrending(cdnBase, tag).catch(() => null);
    const identity = { tag, generatedAt: published?.generatedAt };
    const total = published?.total;

    if (
      !force &&
      published?.generatedAt !== undefined &&
      published.generatedAt === servedGeneratedAt
    ) {
      // The published run is the one already served, so the body is byte
      // -identical: keep serving the cache and skip the download entirely.
      emitIndex({
        ...identity,
        total,
        profilesAt: servedProfilesAt,
        profilesTag: servedProfilesTag,
        origin: "unchanged",
        checkedAt: deps.now(),
      });
      trendingIds = (await trending) ?? trendingIds;
      // The profiles dataset moves on its own schedule — an unchanged
      // registry index says nothing about it, so revalidate it here too.
      // A refresh re-decorates the cached skills in place, so the record is
      // re-saved with the new stamp (still no registry body download), and
      // the re-announced index carries the new profiles tag so per-skill
      // profile fetches pin to the snapshot now being served.
      if (await loadProfiles(gen, force)) {
        void deps.cache.save(store, {
          ...identity,
          profilesAt: servedProfilesAt,
          profilesTag: servedProfilesTag,
        });
        emitIndex({
          ...identity,
          total,
          profilesAt: servedProfilesAt,
          profilesTag: servedProfilesTag,
          origin: "unchanged",
          checkedAt: deps.now(),
        });
      }
      return;
    }

    const revalidating = complete && store.length > 0;
    const buffer: Skill[] = [];
    // Started with the body so its latency hides inside the multi-megabyte
    // index download; never rejects — a failure resolves null, which joins
    // nothing (stars stay 0) rather than failing the dataset. Not needed on
    // the "unchanged" path above: cached skills already carry their stars.
    // A failed join is also never persisted (see the landing point below) —
    // an unchanged snapshot never re-runs the join, so stars-less skills
    // would otherwise be cached for a full day.
    const stars = deps.readRepos(cdnBase, tag).catch(() => null);
    if (!revalidating) {
      // Queries read the buffer as it fills (progressive page one); the
      // count-0 reset itself needs no event — the main-thread client boots
      // at count 0 and only paints once the first skills notify.
      store = buffer;
      trendingIds = null;
      announcedCount = 0;
      lastNotify = 0;
      invalidateDerived();
    }
    try {
      await deps.readIndex(
        cdnBase,
        tag,
        stars,
        (skill) => {
          buffer.push(skill);
          if (!revalidating) notifyThrottled(buffer.length);
        },
        () => {
          buffer.length = 0;
          if (!revalidating) announcedCount = 0;
        },
      );
    } catch (err: unknown) {
      if (gen !== generation) return;
      // Without pre-existing data the failure leaves the registry empty;
      // with it (cache / previous source) the old data keeps serving.
      if (!revalidating) {
        store = [];
        complete = false;
        ready = false;
        search = null;
        dataVersion++;
        announcedCount = 0;
        // Nothing is being served, so the stored record (possibly from an
        // older snapshot) must not be reused by the next cold start either.
        servedGeneratedAt = undefined;
        indexInfo = null;
        void deps.cache.clear();
        emitProgress();
        post({ type: "index", info: null });
      } else if (indexInfo) {
        post({ type: "index", info: indexInfo });
      }
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (gen !== generation) return;
    store = buffer;
    complete = true;
    ready = false;
    search = null;
    announcedCount = buffer.length;
    invalidateDerived();
    // Land the trending list with the data it belongs to. A failed fetch
    // keeps whatever was served before (null on a fresh boot) rather than
    // dropping the board outright.
    trendingIds = (await trending) ?? trendingIds;
    // Decorate the fresh store from the held profiles map right away so the
    // landed pages carry profiles even if the refresh below never answers;
    // then revalidate the profiles dataset itself before the search index is
    // built, so the index covers the domains it lands with.
    decorate();
    await loadProfiles(gen, force);
    // No separate "landed" event: buildIndex immediately emits the settled
    // count and posts ready — the index build is synchronous from here.
    // The stars join is settled by now (readIndex awaited it); a failed one
    // is served but never persisted — the "unchanged" short-circuit compares
    // run stamps only, so stars-less skills in the cache would keep being
    // served until the next daily snapshot. Skipping the write costs one
    // re-download on the next launch, which retries the join.
    const starsJoined = (await stars) !== null;
    servedGeneratedAt = identity.generatedAt;
    if (starsJoined) {
      void deps.cache.save(store, {
        ...identity,
        profilesAt: servedProfilesAt,
        profilesTag: servedProfilesTag,
      });
    }
    emitIndex({
      ...identity,
      total,
      profilesAt: servedProfilesAt,
      profilesTag: servedProfilesTag,
      origin: "updated",
      checkedAt: deps.now(),
    });
    buildIndex();
  };

  /** Cached full-list order for a sort mode, built lazily. */
  const orderFor = (sort: SortOrder): number[] => {
    // While the download streams in the list keeps growing, so the cached
    // order would go stale — only cache once the dataset has landed.
    if (
      complete &&
      orderCache?.version === dataVersion &&
      orderCache.sort === sort
    ) {
      return orderCache.ids;
    }
    const ids = store.map((_, id) => id);
    if (sort !== "default") {
      const compare = skillComparator(sort);
      ids.sort((a, b) => compare(store[a], store[b]));
    }
    orderCache = { version: dataVersion, sort, ids };
    return ids;
  };

  const getPage = ({
    query,
    domain,
    sort,
    page,
    pageSize,
  }: PageRequest): PageData => {
    const start = page * pageSize;
    const q = query.trim();
    if (q) {
      // A search owns the whole registry, so there is nothing to answer with
      // until the index over it exists: it is built once the download lands,
      // and before that a query yields nothing rather than a guess over the
      // partial prefix. The main thread keeps its search field disabled until
      // `ready`, so this branch is the contract's backstop.
      if (!search) return { hits: [], total: 0 };
      // Always in relevance order: `sort` orders the browsed list, and
      // re-ranking search hits by download count or name would throw away the
      // ranking (all terms matched, exact/prefix name first, then name > repo
      // > description, popularity as a nudge) that made them hits.
      let hits: SearchHit[] = search(q);
      // A category filter narrows the search results; skills the profiles
      // dataset has not reached simply fall outside every category.
      if (domain) {
        hits = hits.filter((hit) => hit.skill.profile?.domain === domain);
      }
      return { hits: hits.slice(start, start + pageSize), total: hits.length };
    }
    let ids = orderFor(sort);
    if (domain) {
      ids = ids.filter((id) => store[id].profile?.domain === domain);
    }
    return {
      hits: ids
        .slice(start, start + pageSize)
        .map((id) => ({ skill: store[id], matched: {} })),
      total: ids.length,
    };
  };

  /**
   * The distinct profile domains with their skill counts, most-used first.
   * Only profiled skills contribute — the list (and every count) shrinks to
   * zero-shaped answers when the profiles dataset is unavailable. Cached
   * per data version like the sort order; recomputed per request
   * while the dataset streams in.
   */
  const getDomains = (): DomainInfo[] => {
    if (complete && domainCache?.version === dataVersion) {
      return domainCache.domains;
    }
    const counts = new Map<string, number>();
    for (const skill of store) {
      const domain = skill.profile?.domain;
      if (!domain) continue;
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    const domains = Array.from(counts, ([domain, count]) => ({ domain, count }))
      .toSorted(
        (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
      );
    if (complete) domainCache = { version: dataVersion, domains };
    return domains;
  };

  /** Sections shown on the featured page and skills per section. */
  const FEATURED_DOMAIN_SECTIONS = 6;
  const FEATURED_DOMAIN_SECTION_SIZE = 6;

  /**
   * Real-domain featured sections: the most-populated profile domains (the
   * catch-all "其他" excluded), each led by its most-installed profiled
   * skills. Null when no profiles are being served — the page then falls
   * back to the hand-curated sections instead of going empty.
   */
  const domainSections = (): FeaturedSectionData[] | null => {
    const byDomain = new Map<string, Skill[]>();
    for (const skill of store) {
      const domain = skill.profile?.domain;
      if (!domain || domain === "其他") continue;
      const bucket = byDomain.get(domain);
      if (bucket) bucket.push(skill);
      else byDomain.set(domain, [skill]);
    }
    if (byDomain.size === 0) return null;
    return Array.from(byDomain, ([domain, skills]) => ({ domain, skills }))
      .toSorted(
        (a, b) =>
          b.skills.length - a.skills.length || a.domain.localeCompare(b.domain),
      )
      .slice(0, FEATURED_DOMAIN_SECTIONS)
      .map(({ domain, skills }) => ({
        id: domain,
        title: domain,
        skills: skills
          .toSorted((a, b) => b.downloads - a.downloads)
          .slice(0, FEATURED_DOMAIN_SECTION_SIZE)
          .map((skill) => ({ skill, index: 0 })),
      }));
  };

  /** The hand-curated fallback, resolved against the registry by identity. */
  const curatedSections = (): FeaturedSectionData[] => {
    return FEATURED_CATEGORIES.map((category) => ({
      id: category.id,
      title: category.title,
      skills: category.skills
        .map((ref) =>
          store.find((s) => s.repo === ref.repo && s.name === ref.name),
        )
        .filter((skill): skill is Skill => skill != null),
    }))
      .filter((category) => category.skills.length > 0)
      .map((category) => ({
        ...category,
        skills: category.skills.map((skill) => ({ skill, index: 0 })),
      }));
  };

  /** Featured payload: hero slides plus domain (or curated) sections. */
  const getFeatured = () => {
    const slides = buildHeroSlides(store, trendingIds);
    const resolved = domainSections() ?? curatedSections();
    // Number the resolved skills across sections so the detail panel can
    // walk the whole list with prev/next.
    let next = 0;
    const sections = resolved.map((category) => ({
      ...category,
      skills: category.skills.map(({ skill }) => ({
        skill,
        index: next++,
      })),
    }));
    return { slides, sections };
  };

  /**
   * One leaderboard, ranked here and truncated to `RANKING_SIZE` so the main
   * thread only ever receives what the page can show. An unknown id throws,
   * which `handle` turns into an `ok: false` reply.
   */
  const getRanking = ({ rankingId }: RankingRequest): RankingData => {
    const def = rankingById(rankingId);
    if (!def) throw new Error(`未知榜单：${rankingId}`);
    const { entries, total } = rankSkills(store, def, RANKING_SIZE, trendingIds);
    return {
      id: def.id,
      title: def.title,
      gradient: def.gradient,
      entries,
      total,
    };
  };

  /**
   * The lookup index for one data version, built lazily. A skill is keyed
   * by its repo+name and by its repo+path basename (a locally installed
   * skill's SKILL.md name may differ from the registry skillId); the first
   * skill in registry order wins each key, mirroring what a `store.find`
   * over the same condition would answer.
   */
  const lookupIndex = (): Map<string, Skill> => {
    if (complete && lookupCache?.version === dataVersion) {
      return lookupCache.map;
    }
    const map = new Map<string, Skill>();
    for (const skill of store) {
      const key = `${skill.repo}\u0000${skill.name}`;
      if (!map.has(key)) map.set(key, skill);
      const base = skill.path?.split("/").pop();
      if (base) {
        const alt = `${skill.repo}\u0000${base}`;
        if (!map.has(alt)) map.set(alt, skill);
      }
    }
    lookupCache = { version: dataVersion, map };
    return map;
  };

  /**
   * Registry metadata for installed skills, in ref order (null on miss).
   * A ref matches by name first, then by the registry path's basename.
   */
  const lookupSkills = (refs: Array<{ repo: string; name: string }>) => {
    const byKey = lookupIndex();
    return {
      entries: refs.map(
        (ref) => byKey.get(`${ref.repo}\u0000${ref.name}`) ?? null,
      ),
    };
  };

  return {
    /** Current snapshot for tests and assertions. */
    stats(): RegistryStats {
      return {
        count: announcedCount,
        complete,
        indexing: complete && !ready,
        ready,
        index: indexInfo,
      };
    },

    /** Entry point: serve the cold-start cache, then revalidate it. */
    init({ cdnBase: base }: { cdnBase: string }) {
      if (bootStarted) return;
      bootStarted = true;
      cdnBase = base;
      const gen = ++generation;
      void (async () => {
        const cached = await deps.cache.load();
        if (cached && cached.skills.length > 0 && gen === generation) {
          store = cached.skills;
          servedGeneratedAt = cached.generatedAt;
          // The cached skills are already decorated with the profiles they
          // were saved with; the stamp/tag below is what the revalidation's
          // profiles probe is compared against, and what per-skill profile
          // fetches pin to until a newer snapshot lands. The map behind that
          // decoration is recovered here, so a body downloaded below can be
          // re-decorated even when the refresh never answers.
          servedProfilesAt = cached.profilesAt;
          servedProfilesTag = cached.profilesTag;
          profilesMap = profilesOf(cached.skills);
          profilesAnsweredFor = new Set(cached.skills.map(profileId));
          complete = true;
          announcedCount = cached.skills.length;
          emitProgress();
          buildIndex();
          // What is on screen until the probe below answers.
          emitIndex({
            tag: cached.tag,
            generatedAt: cached.generatedAt,
            total: cached.skills.length,
            profilesAt: cached.profilesAt,
            profilesTag: cached.profilesTag,
            origin: "cache",
          });
        }
        await download(gen);
      })();
    },

    /**
     * Source switch or manual retry: download afresh even when the published
     * run has not moved. The stored record is deliberately left alone — it is
     * addressed by the snapshot's own identity, not by the source it came
     * from, so a switch that fails still leaves the next cold start something
     * to serve (a successful download overwrites it below).
     */
    reload({ cdnBase: base }: { cdnBase: string }) {
      cdnBase = base;
      const gen = ++generation;
      void download(gen, true);
    },

    /**
     * Cheap, non-destructive freshness check: the periodic one behind the
     * app's silent auto-refresh, and the Settings button.
     *
     * It probes the published stats and downloads only what actually moved.
     * Unlike a boot or a forced reload it never falls through to an unpinned
     * body fetch, so a probe that answers nothing leaves the served data
     * untouched instead of pulling the multi-megabyte index on a guess.
     */
    async revalidate({ id }: { id: number }) {
      const gen = generation;
      const published = await deps.probeMeta(cdnBase).catch(() => null);
      // The stamp is the snapshot's freshness identity. A superseded run, an
      // unreachable probe, and a partial probe (tag resolved but stats
      // unreadable) all leave it unknown: nothing can be compared, so nothing
      // is downloaded and the check stays undated — the caller retries on its
      // next tick.
      if (
        gen !== generation ||
        published === null ||
        published.generatedAt === undefined
      ) {
        post({ type: "result", id, ok: true, data: { status: "unknown" } });
        return;
      }
      let status: RevalidateStatus;
      if (published.generatedAt === servedGeneratedAt) {
        // The published run is the one already being served. The profiles
        // dataset moves on its own schedule, so it is still revalidated; the
        // (unchanged) identity is re-announced either way, which is what
        // dates the check and re-pins per-skill profile fetches to a
        // refreshed profiles tag.
        const profilesRefreshed = await loadProfiles(gen, false);
        emitIndex({
          tag: published.tag,
          generatedAt: published.generatedAt,
          total: published.total,
          profilesAt: servedProfilesAt,
          profilesTag: servedProfilesTag,
          origin: "unchanged",
          checkedAt: deps.now(),
        });
        status = profilesRefreshed ? "updated" : "current";
      } else {
        // A newer run is published: the ordinary non-blanking download path,
        // pinned to the tag the probe just resolved.
        await download(gen, false, published);
        // A failed body download keeps the previous snapshot, so the check
        // learned something it could not act on.
        status =
          servedGeneratedAt === published.generatedAt ? "updated" : "unknown";
      }
      post({ type: "result", id, ok: true, data: { status } });
    },

    /** Handle one synchronous query from the main thread. */
    handle(message: RegistryQuery) {
      try {
        let data: unknown;
        switch (message.type) {
          case "getPage":
            data = getPage(message.payload);
            break;
          case "getFeatured":
            data = getFeatured();
            break;
          case "getRanking":
            data = getRanking(message.payload);
            break;
          case "lookupSkills":
            data = lookupSkills(message.payload.refs);
            break;
          case "getDomains":
            data = getDomains();
            break;
        }
        post({ type: "result", id: message.id, ok: true, data });
      } catch (err: unknown) {
        post({
          type: "result",
          id: message.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
