import type { Skill } from "../../types/skill";
import { FEATURED_CATEGORIES } from "../../data/featured-content";
import {
  buildSkillSearch,
  containsSearch,
  type SkillSearch,
} from "../search-skills";
import type {
  PageData,
  PageRequest,
  RankingData,
  RankingRequest,
  RepoInfo,
  RepoPageData,
  ReposRequest,
  RegistryEvent,
  RegistryRequest,
  RegistryWorkerMessage,
  SearchHit,
  SortOrder,
} from "./protocol";
import type { RegistryCache } from "./cache";
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
   * Stream the JSONL index, handing every parsed skill to `onLine`.
   * `onRestart` is called at the start of each candidate attempt so the
   * controller can drop its partial buffer (a failed mid-stream candidate
   * restarts the parse from scratch).
   */
  readIndex(
    cdnBase: string,
    onLine: (skill: Skill) => void,
    onRestart: () => void,
  ): Promise<void>;
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

  // Sort orders are cached per data version: navigating pages of a 24k-entry
  // sorted list re-slices but never re-sorts.
  let dataVersion = 0;
  let orderCache: { version: number; sort: SortOrder; ids: number[] } | null =
    null;
  // Aggregated per-repo summaries, cached per data version like the sort
  // order: grouping the registry is an O(n) pass, page requests only filter,
  // sort and slice the (much smaller) repo list.
  let repoCache: { version: number; repos: RepoInfo[] } | null = null;

  const emitProgress = () => {
    post({
      type: "progress",
      count: announcedCount,
      complete,
      indexing: complete && !ready,
    });
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
    // Hundreds of milliseconds for ~24k entries — acceptable inside the
    // worker, which is exactly why it lives here and not on the main thread.
    search = buildSkillSearch(store);
    ready = true;
    emitProgress();
    post({ type: "ready" });
  };

  /**
   * Download the index into a fresh buffer, keeping any data already being
   * served (cold-start cache, previous source) visible and queryable until
   * the new stream completes — a revalidation never blanks the UI.
   */
  const download = async (gen: number) => {
    const revalidating = complete && store.length > 0;
    const buffer: Skill[] = [];
    if (!revalidating) {
      // Queries read the buffer as it fills (progressive page one); the
      // count-0 reset itself needs no event — the main-thread client boots
      // at count 0 and only paints once the first skills notify.
      store = buffer;
      announcedCount = 0;
      lastNotify = 0;
      dataVersion++;
      orderCache = null;
      repoCache = null;
    }
    try {
      await deps.readIndex(
        cdnBase,
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
        emitProgress();
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
    // No separate "landed" event: buildIndex immediately emits the settled
    // count and posts ready — the index build is synchronous from here.
    void deps.cache.save(store);
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
      const hits: SearchHit[] = search ? search(q) : containsSearch(store, q);
      if (sort !== "default") {
        if (sort === "downloads") {
          hits.sort((a, b) => b.skill.downloads - a.skill.downloads);
        } else {
          hits.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
        }
      }
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
        entry.downloads += skill.downloads;
        // Same repo, same star count; max() simply tolerates bad data.
        entry.stars = Math.max(entry.stars, skill.stars);
      } else {
        byRepo.set(skill.repo, {
          repo: skill.repo,
          skills: 1,
          downloads: skill.downloads,
          stars: skill.stars,
        });
      }
    }
    const repos = [...byRepo.values()].sort(
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
    repos = [...repos].sort((a, b) =>
      sort === "skills"
        ? b.skills - a.skills || byName(a, b)
        : sort === "downloads"
          ? b.downloads - a.downloads || byName(a, b)
          : sort === "name"
            ? byName(a, b)
            : b.stars - a.stars || byName(a, b),
    );
    const start = page * pageSize;
    return { repos: repos.slice(start, start + pageSize), total: repos.length };
  };

  /** Featured payload: hero slides plus resolved curated sections. */
  const getFeatured = () => {
    const slides = buildHeroSlides(store);
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
    const { entries, total } = rankSkills(store, def, RANKING_SIZE);
    return {
      id: def.id,
      title: def.title,
      gradient: def.gradient,
      entries,
      total,
    };
  };

  /**
   * Registry metadata for installed skills, in ref order (null on miss).
   * A ref matches by skillId or by the registry path's basename, since a
   * locally installed skill's SKILL.md name may differ from the skillId.
   */
  const lookupSkills = (refs: Array<{ repo: string; name: string }>) => ({
    entries: refs.map((ref) => {
      const base = (path?: string) => path?.split("/").pop();
      return (
        store.find(
          (s) =>
            s.repo === ref.repo &&
            (s.name === ref.name || base(s.path) === ref.name),
        ) ?? null
      );
    }),
  });

  return {
    /** Current snapshot for tests and assertions. */
    stats(): RegistryStats {
      return {
        count: announcedCount,
        complete,
        indexing: complete && !ready,
        ready,
      };
    },

    /** Entry point: read the cold-start cache, then revalidate. */
    init({ cdnBase: base }: { cdnBase: string }) {
      if (bootStarted) return;
      bootStarted = true;
      cdnBase = base;
      const gen = ++generation;
      void (async () => {
        const cached = await deps.cache.load();
        if (cached && cached.length > 0 && gen === generation) {
          store = cached;
          complete = true;
          announcedCount = cached.length;
          emitProgress();
          buildIndex();
        }
        await download(gen);
      })();
    },

    /** Source switch or manual retry: drop the cache and download afresh. */
    reload({ cdnBase: base }: { cdnBase: string }) {
      cdnBase = base;
      const gen = ++generation;
      void deps.cache.clear();
      void download(gen);
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
