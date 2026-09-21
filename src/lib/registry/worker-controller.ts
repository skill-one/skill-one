import type { Skill } from "../../types/skill";
import { FEATURED_CATEGORIES } from "../../data/featured-content";
import { domainLabel, domainMeta } from "../../data/domains";
import { popularity } from "../popularity";
import { buildSkillSearch, type SkillSearch } from "../search-skills";
import type {
  DomainInfo,
  FeaturedSectionData,
  Group,
  GroupCounts,
  GroupsData,
  GroupsRequest,
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
 *
 * The dataset arrives fully decorated: every row carries its own
 * classification, so one download yields servable skills and there is no
 * second source to merge in afterwards.
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

/** The pool label the `domain` grouping collects unclassified skills under. */
const UNCLASSIFIED_DOMAIN = "未分类";

/**
 * The dataset's catch-all domain key. It carries no meaning of its own, so
 * the featured sections skip it instead of leading with a "其他" shelf.
 */
const OTHER_DOMAIN = "other";

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
        origin: "unchanged",
        checkedAt: deps.now(),
      });
      trendingIds = (await trending) ?? trendingIds;
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
    // No separate "landed" event: buildIndex immediately emits the settled
    // count and posts ready — the index build is synchronous from here.
    // The stars join is settled by now (readIndex awaited it); a failed one
    // is served but never persisted — the "unchanged" short-circuit compares
    // run stamps only, so stars-less skills in the cache would keep being
    // served until the next daily snapshot. Skipping the write costs one
    // re-download on the next launch, which retries the join.
    const starsJoined = (await stars) !== null;
    servedGeneratedAt = identity.generatedAt;
    if (starsJoined) void deps.cache.save(store, identity);
    emitIndex({
      ...identity,
      total,
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

  /** Whether one skill belongs to the requested domain key. */
  const inDomain = (skill: Skill, domain: string): boolean =>
    skill.profile?.domain.includes(domain) ?? false;

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
      // ranking (all terms matched, exact/prefix name first, then popularity)
      // that made them hits.
      let hits: SearchHit[] = search(q);
      // A category filter narrows the search results; skills the dataset has
      // not classified simply fall outside every category. A skill classified
      // under several domains matches each of them.
      if (domain) {
        hits = hits.filter((hit) => inDomain(hit.skill, domain));
      }
      return { hits: hits.slice(start, start + pageSize), total: hits.length };
    }
    let ids = orderFor(sort);
    if (domain) {
      ids = ids.filter((id) => inDomain(store[id], domain));
    }
    return {
      hits: ids
        .slice(start, start + pageSize)
        .map((id) => ({ skill: store[id], matched: {} })),
      total: ids.length,
    };
  };

  /** Skills per popularity bucket in the `TOP 1-50` grouping. */
  const GROUP_BUCKET_SIZE = 50;

  /**
   * How many groups each offered mode would produce over the same hits —
   * the grouping dropdown annotates its options with these so the reader can
   * compare the modes before committing to one. Every figure is a cheap set
   * or arithmetic pass: unique repos, the bucket math, unique domains (with
   * the unclassified pool counting as one).
   */
  const countGroups = (hits: SearchHit[]): GroupCounts => {
    const repos = new Set<string>();
    const domains = new Set<string>();
    for (const hit of hits) {
      repos.add(hit.skill.repo);
      const list = hit.skill.profile?.domain;
      if (!list || list.length === 0) domains.add(UNCLASSIFIED_DOMAIN);
      else for (const domain of list) domains.add(domain);
    }
    return {
      repo: repos.size,
      popularity: Math.ceil(hits.length / GROUP_BUCKET_SIZE),
      domain: domains.size,
    };
  };

  /**
   * The explore list grouped by the requested mode. Each mode implies its own
   * ordering — the toolbar offers one grouping choice instead of a grouping
   * plus a sort — and every mode starts from the same ordered hits: a search
   * stays in relevance order, the browsed list follows the popularity blend.
   * Bucketing those hits via `Map` insertion order puts each group's skills
   * in hit order and the groups themselves in first-appearance order (i.e.
   * best-hit-first under a search); the browse path re-orders the groups
   * per mode afterwards.
   *
   * - `repo`: one group per repository, most-starred first.
   * - `popularity`: fixed-size rank buckets over the ordered hits, in rank
   *   order by construction (`TOP 1-50`, `TOP 51-100`, …).
   * - `domain`: one group per profile domain, most-populated first, with
   *   unclassified skills pooled into 未分类 so nothing disappears. A skill
   *   classified under several domains appears in each of its groups.
   * - `recency`: reserved — the dataset does not publish an update time yet,
   *   so the mode is not offered (see `GroupBy`).
   *
   * Unlike `getPage` there is no slicing: the full filtered answer crosses the
   * boundary and the page folds groups away instead of paging them. Closed
   * groups render no cards, so the DOM stays at the expanded groups only —
   * the payload, not the render, is the price of dropping the pager.
   */
  const getGroups = ({
    query,
    groupBy,
  }: GroupsRequest): GroupsData => {
    const q = query.trim();
    let hits: SearchHit[];
    if (q) {
      if (!search) {
        return {
          groups: [],
          total: 0,
          groupCounts: { repo: 0, popularity: 0, domain: 0 },
        };
      }
      hits = search(q);
    } else {
      hits = orderFor("popularity").map((id) => ({
        skill: store[id],
        matched: {},
      }));
    }

    let groups: Group[];
    if (groupBy === "popularity") {
      // Fixed-size rank buckets over the ordered hits; the title is the rank
      // range the bucket covers and rank order is the group order.
      groups = [];
      for (let start = 0; start < hits.length; start += GROUP_BUCKET_SIZE) {
        const bucket = hits.slice(start, start + GROUP_BUCKET_SIZE);
        groups.push({
          key: `pop-${start}`,
          title: `TOP ${start + 1}-${start + bucket.length}`,
          skills: bucket,
        });
      }
    } else if (groupBy === "domain") {
      const buckets = new Map<string, SearchHit[]>();
      for (const hit of hits) {
        // A skill may be classified under several domains, so it lands in
        // each of its groups; everything unclassified pools together.
        const keys = hit.skill.profile?.domain.length
          ? hit.skill.profile.domain
          : [UNCLASSIFIED_DOMAIN];
        for (const key of keys) {
          const bucket = buckets.get(key);
          if (bucket) bucket.push(hit);
          else buckets.set(key, [hit]);
        }
      }
      groups = Array.from(buckets, ([domain, skills]) => ({
        key: `domain-${domain}`,
        title: domain === UNCLASSIFIED_DOMAIN ? domain : domainLabel(domain),
        emoji: domainMeta(domain)?.emoji,
        skills,
      })).toSorted(
        (a, b) =>
          b.skills.length - a.skills.length || a.title.localeCompare(b.title),
      );
    } else {
      const buckets = new Map<string, SearchHit[]>();
      for (const hit of hits) {
        const bucket = buckets.get(hit.skill.repo);
        if (bucket) bucket.push(hit);
        else buckets.set(hit.skill.repo, [hit]);
      }
      groups = Array.from(buckets, ([repo, skills]) => ({
        key: `repo-${repo}`,
        title: repo,
        avatarOwner: repo.split("/")[0],
        stars: Math.max(...skills.map(({ skill }) => skill.stars)),
        skills,
      }));
      if (!q) {
        groups.sort(
          (a, b) =>
            (b.stars ?? 0) - (a.stars ?? 0) ||
            b.skills.length - a.skills.length ||
            a.title.localeCompare(b.title),
        );
      }
    }
    return { groups, total: hits.length, groupCounts: countGroups(hits) };
  };

  /**
   * The distinct profile domains with their skill counts, most-used first.
   * Only classified skills contribute — the list (and every count) shrinks to
   * zero-shaped answers when the dataset carries no classification. A skill
   * classified under several domains counts once per domain. Cached per data
   * version like the sort order; recomputed per request while the dataset
   * streams in.
   */
  const getDomains = (): DomainInfo[] => {
    if (complete && domainCache?.version === dataVersion) {
      return domainCache.domains;
    }
    const counts = new Map<string, number>();
    for (const skill of store) {
      for (const domain of skill.profile?.domain ?? []) {
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
      }
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
   * catch-all "其他" excluded), each led by its most-installed classified
   * skills. Null when nothing is classified — the page then falls back to the
   * hand-curated sections instead of going empty. A skill classified under
   * several domains may lead more than one section.
   */
  const domainSections = (): FeaturedSectionData[] | null => {
    const byDomain = new Map<string, Skill[]>();
    for (const skill of store) {
      for (const domain of skill.profile?.domain ?? []) {
        if (domain === OTHER_DOMAIN) continue;
        const bucket = byDomain.get(domain);
        if (bucket) bucket.push(skill);
        else byDomain.set(domain, [skill]);
      }
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
        title: domainLabel(domain),
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
        // The published run is the one already being served. The identity is
        // re-announced, which is what dates the check.
        emitIndex({
          tag: published.tag,
          generatedAt: published.generatedAt,
          total: published.total,
          origin: "unchanged",
          checkedAt: deps.now(),
        });
        status = "current";
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
          case "getGroups":
            data = getGroups(message.payload);
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
