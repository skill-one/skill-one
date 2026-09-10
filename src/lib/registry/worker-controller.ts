import type { Skill } from "../../types/skill";
import { FEATURED_CATEGORIES } from "../../data/featured-content";
import {
  buildSkillSearch,
  containsSearch,
  type SkillSearch,
} from "../search-skills";
import type {
  IndexInfo,
  PageData,
  PageRequest,
  RankingData,
  RankingRequest,
  RepoInfo,
  RepoPageData,
  ReposRequest,
  RegistryRequest,
  RegistryWorkerMessage,
  SearchHit,
  SortOrder,
} from "./protocol";
import type { RegistryCache } from "./cache";
import type { PublishedIndex } from "./index-stream";
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
 * The controller owns the downloaded registry, the MiniSearch index built
 * over it, and every request the main thread can ask: paged browse/search,
 * featured-page computation, and installed-skill metadata lookups. All
 * answers are page-sized or smaller — the full registry never leaves here.
 */

/** How often partial counts are pushed while the download streams in. */
const PROGRESS_INTERVAL_MS = 400;

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
  /** Cold-start cache; every method may silently no-op. */
  cache: RegistryCache;
  /** Clock for progress throttling, injectable for tests. */
  now(): number;
}

export interface RegistryStats {
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
  // Last announced snapshot identity, kept for `stats()` and for tests.
  let indexInfo: IndexInfo | null = null;

  // The array every query reads. During a fresh (non-revalidating) download
  // it points at the growing buffer, so paged browse / substring search /
  // lookups see the loaded prefix while the stream is still in flight.
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
  // Aggregated per-repo summaries, cached per data version like the sort
  // order: grouping the registry is an O(n) pass, page requests only filter,
  // sort and slice the (much smaller) repo list.
  let repoCache: { version: number; repos: RepoInfo[] } | null = null;
  // Lookup index for `lookupSkills`, cached per data version: resolving each
  // ref by a `store.find` is O(n·m), so instead the earliest matching skill
  // per key is indexed once and every request is a pair of map reads.
  let lookupCache: { version: number; map: Map<string, Skill> } | null = null;

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
   */
  const download = async (gen: number, force = false) => {
    // Null means no source answered: nothing to pin, nothing to compare.
    const published = await deps.probeMeta(cdnBase);
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
      emitIndex({ ...identity, total, origin: "unchanged" });
      trendingIds = (await trending) ?? trendingIds;
      return;
    }

    const revalidating = complete && store.length > 0;
    const buffer: Skill[] = [];
    if (!revalidating) {
      // Queries read the buffer as it fills (progressive page one); the
      // count-0 reset itself needs no event — the main-thread client boots
      // at count 0 and only paints once the first skills notify.
      store = buffer;
      trendingIds = null;
      announcedCount = 0;
      lastNotify = 0;
      dataVersion++;
      orderCache = null;
      repoCache = null;
      lookupCache = null;
    }
    try {
      await deps.readIndex(
        cdnBase,
        tag,
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
    dataVersion++;
    orderCache = null;
    repoCache = null;
    lookupCache = null;
    // Land the trending list with the data it belongs to. A failed fetch
    // keeps whatever was served before (null on a fresh boot) rather than
    // dropping the board outright.
    trendingIds = (await trending) ?? trendingIds;
    // No separate "landed" event: buildIndex immediately emits the settled
    // count and posts ready — the index build is synchronous from here.
    servedGeneratedAt = identity.generatedAt;
    void deps.cache.save(store, identity);
    emitIndex({ ...identity, total, origin: "updated" });
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
    if (sort === "downloads") {
      ids.sort((a, b) => store[b].downloads - store[a].downloads);
    } else if (sort === "name") {
      ids.sort((a, b) => store[a].name.localeCompare(store[b].name));
    }
    orderCache = { version: dataVersion, sort, ids };
    return ids;
  };

  const getPage = ({
    query,
    repo,
    sort,
    page,
    pageSize,
  }: PageRequest): PageData => {
    const start = page * pageSize;
    if (repo !== undefined) {
      // Repo detail page: an exact identity filter, not a search — every
      // skill of the repo, in registry order (or the chosen sort). Recomputed
      // per request so pages settle as the download streams in.
      const hits: SearchHit[] = [];
      for (const skill of store) {
        if (skill.repo === repo) hits.push({ skill, matched: {} });
      }
      if (sort !== "default") {
        if (sort === "downloads") {
          hits.sort((a, b) => b.skill.downloads - a.skill.downloads);
        } else {
          hits.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
        }
      }
      return { hits: hits.slice(start, start + pageSize), total: hits.length };
    }
    const q = query.trim();
    if (q) {
      // Fuzzy once the index is up; substring over what has loaded so far
      // while the download is still streaming. The results settle once the
      // index lands (the main thread refetches on `ready`).
      //
      // Always in relevance order: `sort` orders the browsed list, and
      // re-ranking search hits by download count or name would throw away the
      // ranking (name match > repo > description, install count as tie-break)
      // that made them hits in the first place.
      const hits: SearchHit[] = search ? search(q) : containsSearch(store, q);
      return { hits: hits.slice(start, start + pageSize), total: hits.length };
    }
    const ids = orderFor(sort);
    return {
      hits: ids
        .slice(start, start + pageSize)
        .map((id) => ({ skill: store[id], matched: {} })),
      total: ids.length,
    };
  };

  /**
   * Aggregated per-repo summaries. While the download streams in the list
   * keeps growing, so the aggregation is recomputed per request; once the
   * dataset has landed it is cached per data version (see `repoCache`).
   */
  const reposFor = (): RepoInfo[] => {
    if (complete && repoCache?.version === dataVersion) return repoCache.repos;
    const byRepo = new Map<string, RepoInfo>();
    for (const skill of store) {
      const entry = byRepo.get(skill.repo);
      if (entry) {
        entry.skills++;
        // Same repo, same star count; max() simply tolerates bad data.
        entry.stars = Math.max(entry.stars, skill.stars);
      } else {
        byRepo.set(skill.repo, {
          repo: skill.repo,
          skills: 1,
          stars: skill.stars,
        });
      }
    }
    const repos = Array.from(byRepo.values()).toSorted(
      (a, b) => b.skills - a.skills || a.repo.localeCompare(b.repo),
    );
    if (complete) repoCache = { version: dataVersion, repos };
    return repos;
  };

  const getRepos = ({
    query,
    sort,
    page,
    pageSize,
  }: ReposRequest): RepoPageData => {
    const q = query.trim().toLowerCase();
    let repos = reposFor();
    if (q) repos = repos.filter((repo) => repo.repo.toLowerCase().includes(q));
    const byName = (a: RepoInfo, b: RepoInfo) => a.repo.localeCompare(b.repo);
    repos = repos.toSorted((a, b) =>
      sort === "skills"
        ? b.skills - a.skills || byName(a, b)
        : sort === "name"
          ? byName(a, b)
          : b.stars - a.stars || byName(a, b),
    );
    const start = page * pageSize;
    return { repos: repos.slice(start, start + pageSize), total: repos.length };
  };

  /** Featured payload: hero slides plus resolved curated sections. */
  const getFeatured = () => {
    const slides = buildHeroSlides(store, trendingIds);
    const resolved = FEATURED_CATEGORIES.map((category) => ({
      id: category.id,
      title: category.title,
      skills: category.skills
        .map((ref) =>
          store.find((s) => s.repo === ref.repo && s.name === ref.name),
        )
        .filter((skill): skill is Skill => skill != null),
    })).filter((category) => category.skills.length > 0);
    // Number the resolved skills across sections so the detail panel can
    // walk the whole curated list with prev/next.
    let next = 0;
    const sections = resolved.map((category) => ({
      ...category,
      skills: category.skills.map((skill) => ({
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
          complete = true;
          announcedCount = cached.skills.length;
          emitProgress();
          buildIndex();
          // What is on screen until the probe below answers.
          emitIndex({
            tag: cached.tag,
            generatedAt: cached.generatedAt,
            total: cached.skills.length,
            origin: "cache",
          });
        }
        await download(gen);
      })();
    },

    /** Source switch or manual retry: drop the cache and download afresh. */
    reload({ cdnBase: base }: { cdnBase: string }) {
      cdnBase = base;
      const gen = ++generation;
      void deps.cache.clear();
      void download(gen, true);
    },

    /** Handle one message from the main thread. */
    handle(message: RegistryRequest) {
      if (!("id" in message)) return; // init/reload are handled above
      try {
        let data: unknown;
        switch (message.type) {
          case "getPage":
            data = getPage(message.payload);
            break;
          case "getRepos":
            data = getRepos(message.payload);
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

export type RegistryController = ReturnType<typeof createRegistryController>;
