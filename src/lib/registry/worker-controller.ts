import type { Skill } from "../../types/skill";
import { DOMAINS, UNCLASSIFIED_DOMAIN } from "../../data/domains";
import { buildSkillSearch, type SkillSearch } from "../search-skills";
import type {
  Group,
  GroupsData,
  GroupsRequest,
  IndexInfo,
  RegistryQuery,
  RegistryWorkerMessage,
  RepoSectionsData,
  RevalidateStatus,
  SearchData,
  SearchHit,
} from "./protocol";
import type { RegistryCache } from "./cache";
import type { PublishedIndex } from "./index-stream";
import { byRepoRank } from "./repo-rank";

/**
 * The registry worker's brain, isolated from the Worker plumbing so the
 * whole service state machine is unit-testable without a real Worker.
 *
 * The controller owns the downloaded registry, the search indexes built over
 * it, and every request the main thread can ask: paged browse/search and
 * installed-skill metadata lookups. All answers are page-sized or smaller —
 * the full registry never leaves here.
 *
 * The dataset arrives fully decorated: every row carries its own
 * classification, so one download yields servable skills and there is no
 * second source to merge in afterwards.
 */

/** How often partial counts are pushed while the download streams in. */
const PROGRESS_INTERVAL_MS = 400;

/** Descending order on the row metric, so list order and displayed figure agree. */
const byInstalls = (a: Skill, b: Skill): number => b.downloads - a.downloads;

/**
 * Reply cap for one name search. A broad query over a multi-thousand-entry
 * registry would otherwise send the whole match list across the boundary at
 * once; consumers need a page's worth, not the answer's full length.
 */
const MAX_SEARCH_HITS = 50;

/**
 * The taxonomy's own order, keyed by domain. Breaks a tied primary-domain vote
 * deterministically and orders domain sections that hold the same number of
 * repositories.
 */
const TAXONOMY_INDEX = new Map(
  DOMAINS.map((domain, index) => [domain.key, index]),
);

/** A domain key's taxonomy position; unknown keys sort after every known one. */
const taxonomyIndex = (key: string): number =>
  TAXONOMY_INDEX.get(key) ?? DOMAINS.length;

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
  // Last announced snapshot identity, kept for `stats()` and for tests.
  let indexInfo: IndexInfo | null = null;

  // The array every query reads. During a fresh (non-revalidating) download
  // it points at the growing buffer, so paged browse and lookups see the
  // loaded prefix while the stream is still in flight. Search is the one
  // exception: it waits for the index over the settled dataset (see searchSkills).
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
  let orderCache: { version: number; ids: number[] } | null = null;
  // Lookup index for `lookupSkills`, cached per data version: resolving each
  // ref by a `store.find` is O(n·m), so instead the earliest matching skill
  // per key is indexed once and every request is a pair of map reads.
  let lookupCache: { version: number; map: Map<string, Skill> } | null = null;

  /**
   * Drop every derived cache and bump the data version they are addressed
   * by, so the next query rebuilds against the dataset now being served.
   */
  const invalidateDerived = () => {
    dataVersion++;
    orderCache = null;
    lookupCache = null;
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

  /**
   * The registry's own order: the whole dataset by install count — the figure
   * the rows display — so the order and the number beside it can never
   * disagree. Cached per data version, and only once the download has landed,
   * since a list that is still growing would leave a cached order stale.
   */
  const installsOrder = (): number[] => {
    if (complete && orderCache?.version === dataVersion) return orderCache.ids;
    const ids = store.map((_, id) => id);
    ids.sort((a, b) => byInstalls(store[a], store[b]));
    orderCache = { version: dataVersion, ids };
    return ids;
  };

  /**
   * A name search, in the index's own relevance order and capped, so a broad
   * query can never send an unbounded reply across the boundary.
   *
   * A search owns the whole registry, so there is nothing to answer with until
   * the index over it exists: it is built once the download lands, and before
   * that a query yields nothing rather than a guess over the partial prefix.
   * The main thread keeps its search field disabled until `ready`, so this is
   * the contract's backstop.
   *
   * Relevance is the only order it speaks: ranking the hits by installs or by
   * name instead would throw away the ranking (all terms matched, exact and
   * prefix name hits first, then installs) that made them hits.
   */
  const searchSkills = (query: string): SearchData => {
    if (!search) return { hits: [] };
    return { hits: search(query.trim()).slice(0, MAX_SEARCH_HITS) };
  };

  /**
   * The explore list: one group per repository, and every group's skills in
   * the order of the hits it was built from. A search stays in relevance
   * order; the browsed list follows install count. Bucketing hits via `Map`
   * insertion order puts each group's skills in hit order and the groups
   * themselves in first-appearance order, which under a search is
   * best-hit-first; browsing re-orders the groups afterwards (by stars), so
   * the largest repositories lead.
   *
   * Unlike a search reply there is no slicing: the answer crosses the boundary
   * whole and the page reveals it in chunks instead of paging it. The payload,
   * not the render, is the price of dropping the pager.
   */
  const getGroups = ({ query }: GroupsRequest): GroupsData => {
    const q = query.trim();
    let hits: SearchHit[];
    if (q) {
      if (!search) return { groups: [], total: 0 };
      hits = search(q);
    } else {
      hits = installsOrder().map((id) => ({
        skill: store[id],
        matched: {},
      }));
    }

    const groups = repoGroups(hits);
    // Browsing leads with the biggest repository, weighed by the stars its
    // card's bar carries.
    if (!q) groups.sort(byRepoRank);
    return { groups, total: hits.length };
  };

  /** Bucket hits by the repository that publishes each skill (its only one). */
  const repoGroups = (hits: SearchHit[]): Group[] => {
    const buckets = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const bucket = buckets.get(hit.skill.repo);
      if (bucket) bucket.push(hit);
      else buckets.set(hit.skill.repo, [hit]);
    }
    return Array.from(buckets, ([repo, skills]) => ({
      key: `repo-${repo}`,
      title: repo,
      stars: Math.max(...skills.map(({ skill }) => skill.stars)),
      skills,
    }));
  };

  /**
   * The one domain a repository is filed under by the domain filter: the
   * domain its skills *lead* with most often (their `domain[0]`, the dataset's
   * best fit), ties broken by the installs those leading skills carry and then
   * by the taxonomy's own order. A repository with no classified skill at all
   * is filed as unclassified rather than as 其他: the two are different claims,
   * and the chip bar states them apart (see `data/domains`).
   */
  const primaryDomain = (skills: SearchHit[]): string => {
    const votes = new Map<string, { count: number; downloads: number }>();
    for (const { skill } of skills) {
      const lead = skill.profile?.domain[0];
      if (!lead) continue;
      const vote = votes.get(lead) ?? { count: 0, downloads: 0 };
      vote.count += 1;
      vote.downloads += skill.downloads;
      votes.set(lead, vote);
    }
    if (votes.size === 0) return UNCLASSIFIED_DOMAIN;
    return [...votes].toSorted(
      ([aKey, a], [bKey, b]) =>
        b.count - a.count ||
        b.downloads - a.downloads ||
        taxonomyIndex(aKey) - taxonomyIndex(bKey),
    )[0][0];
  };

  /**
   * The repository browse answer, filed by domain: every repository once, under
   * its {@link primaryDomain}. The explore page's filter reads it — the sections
   * are its chips, and one section is the list a chip scopes to. Sections are
   * ordered by size (biggest first, ties by the taxonomy's order); within a
   * section the repositories keep the browse order.
   */
  const getRepoSections = (): RepoSectionsData => {
    const repos = repoGroups(
      installsOrder().map((id) => ({ skill: store[id], matched: {} })),
    );

    const byDomain = new Map<string, Group[]>();
    for (const repo of repos) {
      const domain = primaryDomain(repo.skills);
      const bucket = byDomain.get(domain);
      if (bucket) bucket.push(repo);
      else byDomain.set(domain, [repo]);
    }

    const sections = Array.from(byDomain, ([domain, group]) => ({
      key: `domain-${domain}`,
      title: domain,
      repos: group.toSorted(byRepoRank),
    })).toSorted(
      (a, b) =>
        b.repos.length - a.repos.length ||
        taxonomyIndex(a.title) - taxonomyIndex(b.title),
    );

    return { sections, total: repos.length };
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
          case "searchSkills":
            data = searchSkills(message.payload.query);
            break;
          case "getGroups":
            data = getGroups(message.payload);
            break;
          case "getRepoSections":
            data = getRepoSections();
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
