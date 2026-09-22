import { describe, it, expect, vi } from "vitest";

// The curated sections are resolved against the registry by repo + name;
// stub them with references the test dataset actually contains.
vi.mock("../../data/featured-content", () => ({
  FEATURED_CATEGORIES: [
    {
      id: "curated",
      title: "Curated",
      skills: [
        { repo: "acme/alpha", name: "alpha" },
        { repo: "acme/beta", name: "beta" },
      ],
    },
    {
      id: "curated-2",
      title: "Curated 2",
      skills: [{ repo: "acme/alpha", name: "alpha" }],
    },
  ],
}));

import { createRegistryController } from "./worker-controller";
import type { CachedIndex, RegistryCache } from "./cache";
import type { PublishedIndex } from "./index-stream";
import type { GroupsData, RegistryWorkerMessage, RevalidateResult } from "./protocol";
import type { Skill } from "../../types/skill";
import { popularity } from "../popularity";
import { formatCount } from "../utils";

/** Deterministic skill factory; `i` varies name, repo and metrics. */
function skill(i: number, over: Partial<Skill> = {}): Skill {
  return {
    name: `skill-${i}`,
    repo: `owner-${i % 3}/repo-${i % 2}`,
    description: `Description of skill-${i}.`,
    stars: i,
    downloads: 100 - i,
    ...over,
  };
}

type ResultMessage = Extract<RegistryWorkerMessage, { type: "result" }>;

/** A stored record as the cache hands it back: skills plus their identity. */
function record(skills: Skill[], generatedAt?: string): CachedIndex {
  return { skills, generatedAt, fetchedAt: 1 };
}

/** Unwrap a posted result, asserting it succeeded. */
function resultData<T>(message: ResultMessage): T {
  expect(message.ok).toBe(true);
  return (message as { data: unknown }).data as T;
}

interface Recorded {
  messages: RegistryWorkerMessage[];
  results: Array<Extract<RegistryWorkerMessage, { type: "result" }>>;
  progress: Array<Extract<RegistryWorkerMessage, { type: "progress" }>>;
  indexes: Array<Extract<RegistryWorkerMessage, { type: "index" }>>;
  errors: Array<Extract<RegistryWorkerMessage, { type: "error" }>>;
  readyCount: number;
}

/** Drive the controller with an in-memory stream and cache. */
function setup(options?: {
  skills?: Skill[];
  cache?: RegistryCache;
  now?: () => number;
  /** What the sources advertise as published; null = probe found nothing. */
  published?: PublishedIndex | null;
  /** What the trending source serves; null (default) = list unavailable. */
  trending?: string[] | null;
  /**
   * What the repos.jsonl source serves (the stars join); null (default) =
   * sidecar unavailable.
   */
  stars?: Map<string, number> | null;
}) {
  const messages: RegistryWorkerMessage[] = [];
  const recorded: Recorded = {
    messages,
    results: [],
    progress: [],
    indexes: [],
    errors: [],
    readyCount: 0,
  };
  const post = (message: RegistryWorkerMessage) => {
    messages.push(message);
    if (message.type === "result") recorded.results.push(message);
    else if (message.type === "progress") recorded.progress.push(message);
    else if (message.type === "index") recorded.indexes.push(message);
    else if (message.type === "error") recorded.errors.push(message);
    else if (message.type === "ready") recorded.readyCount++;
  };

  let onLine: ((skill: Skill) => void) | null = null;
  const streams: Array<{
    resolve(): void;
    reject(err: unknown): void;
  }> = [];
  /** Tag each started download was pinned to (undefined = branch ref). */
  const pins: Array<string | undefined> = [];
  const readIndex = async (
    _cdnBase: string,
    tag: string | undefined,
    _stars: Promise<Map<string, number> | null>,
    line: (skill: Skill) => void,
  ): Promise<void> => {
    onLine = line;
    pins.push(tag);
    if (options?.skills) {
      for (const s of options.skills) line(s);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      streams.push({ resolve, reject });
    });
  };

  const controller = createRegistryController(
    {
      probeMeta: async () => options?.published ?? null,
      readIndex,
      readTrending: async () => options?.trending ?? null,
      // Default: the sidecar answered (an empty map is a valid join); pass
      // `stars: null` to simulate an unreachable repos.jsonl. `??` alone
      // would fall through on null, so the guard is explicit.
      readRepos: async () =>
        options && options.stars !== undefined
          ? options.stars
          : new Map<string, number>(),
      cache: options?.cache ?? {
        load: async () => null,
        save: async () => {},
        clear: async () => {},
      },
      now: options?.now ?? (() => 0),
    },
    post,
  );

  return {
    controller,
    recorded,
    pins,
    /** Deliver one skill on the newest open stream. */
    push(s: Skill) {
      onLine?.(s);
    },
    /** Complete a stream; -1 is the newest, -2 the one before it. */
    complete(which = -1) {
      streams.at(which)?.resolve();
    },
    /** Fail a stream; -1 is the newest. */
    fail(err: unknown, which = -1) {
      streams.at(which)?.reject(err);
    },
    /** Flush the async boot chain (cache read → meta probe → stream start). */
    async flush() {
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("createRegistryController — boot", () => {
  it("streams skills in, lands the full dataset and reports ready", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.push(skill(0));
    t.push(skill(1));
    t.push(skill(2));
    t.complete();
    await t.flush();

    // Progress led with the first skill, then settled on the full count;
    // indexing flipped on between landing the data and building the index.
    expect(t.recorded.progress.map((p) => p.count)).toEqual([1, 2, 3, 3]);
    expect(t.recorded.progress.at(-1)).toMatchObject({
      count: 3,
      complete: true,
      indexing: false,
    });
    expect(t.recorded.readyCount).toBe(1);
    expect(t.controller.stats()).toMatchObject({
      count: 3,
      complete: true,
      indexing: false,
      ready: true,
    });
  });

  it("serves instantly from the cold-start cache, then revalidates", async () => {
    const cached = record([skill(0), skill(1)], "2026-09-01T14:25:32Z");
    const saved: Skill[][] = [];
    const t = setup({
      cache: {
        load: async () => cached,
        save: async (skills) => {
          saved.push(skills);
        },
        clear: async () => {},
      },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // The cache answers first: ready without any network wait.
    expect(t.controller.stats()).toMatchObject({
      count: 2,
      complete: true,
      indexing: false,
      ready: true,
    });

    // What is on screen is announced as such, including the run it came from.
    expect(t.recorded.indexes.at(-1)?.info).toMatchObject({
      generatedAt: "2026-09-01T14:25:32Z",
      origin: "cache",
    });

    // The background revalidation lands over a manual stream and supersedes
    // the cache.
    t.push(skill(0));
    t.push(skill(1));
    t.push(skill(2));
    t.complete();
    await t.flush();
    expect(t.controller.stats()).toMatchObject({ count: 3, ready: true });
    expect(saved).toEqual([[skill(0), skill(1), skill(2)]]);
    expect(t.recorded.indexes.at(-1)?.info).toMatchObject({ origin: "updated" });
  });

  it("skips the body download when the published run is unchanged", async () => {
    const generatedAt = "2026-09-01T14:25:32Z";
    const saved: Array<[Skill[], unknown]> = [];
    const t = setup({
      cache: {
        load: async () => record([skill(0), skill(1)], generatedAt),
        save: async (skills, identity) => {
          saved.push([skills, identity]);
        },
        clear: async () => {},
      },
      published: {
        tag: "dist-2026-09-01",
        generatedAt,
        total: 2,
      },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // No stream was ever opened: the cached bytes belong to this run.
    expect(t.pins).toEqual([]);
    expect(saved).toEqual([]);
    expect(t.controller.stats()).toMatchObject({ count: 2, ready: true });
    // The read-out still carries what the probe learned (fresh tag, count),
    // and dates the check so the next one is only due once the window passes.
    expect(t.recorded.indexes.at(-1)?.info).toEqual({
      tag: "dist-2026-09-01",
      generatedAt,
      total: 2,
      origin: "unchanged",
      checkedAt: 0,
    });
  });

  it("downloads a newer run pinned to its tag and records it", async () => {
    const saved: Array<[Skill[], unknown]> = [];
    const t = setup({
      cache: {
        load: async () => record([skill(0)], "2026-09-01T14:25:32Z"),
        save: async (skills, identity) => {
          saved.push([skills, identity]);
        },
        clear: async () => {},
      },
      published: {
        tag: "dist-2026-09-06",
        generatedAt: "2026-09-06T15:32:29.423Z",
        total: 8945,
      },
      skills: [skill(0), skill(1)],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // The download is addressed at the published tag, not the branch.
    expect(t.pins).toEqual(["dist-2026-09-06"]);
    expect(saved).toEqual([
      [
        [skill(0), skill(1)],
        { tag: "dist-2026-09-06", generatedAt: "2026-09-06T15:32:29.423Z" },
      ],
    ]);
    expect(t.recorded.indexes.at(-1)?.info).toMatchObject({
      tag: "dist-2026-09-06",
      total: 8945,
      origin: "updated",
      checkedAt: 0,
    });
  });

  it("does not persist the dataset when the stars join failed", async () => {
    const saved: Skill[][] = [];
    const t = setup({
      // Unreachable repos.jsonl: skills land star-less, and the write is
      // skipped so the "unchanged" short-circuit can never serve the loss.
      stars: null,
      cache: {
        load: async () => null,
        save: async (skills) => {
          saved.push(skills);
        },
        clear: async () => {},
      },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    t.push(skill(0));
    t.push(skill(1));
    t.complete();
    await t.flush();

    // The star-less data still serves for this session — only the write to
    // the cold-start cache is withheld, so the next launch retries the join.
    expect(t.controller.stats()).toMatchObject({ count: 2, ready: true });
    expect(saved).toEqual([]);
  });

  it("persists the dataset once the stars join succeeded", async () => {
    const saved: Skill[][] = [];
    const t = setup({
      stars: new Map([["owner-0/repo-0", 12]]),
      cache: {
        load: async () => null,
        save: async (skills) => {
          saved.push(skills);
        },
        clear: async () => {},
      },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    t.push(skill(0));
    t.push(skill(1));
    t.complete();
    await t.flush();

    expect(saved).toEqual([[skill(0), skill(1)]]);
  });

  it("re-downloads an unchanged run when the user forces a reload", async () => {
    const generatedAt = "2026-09-01T14:25:32Z";
    const t = setup({
      published: { tag: "dist-2026-09-01", generatedAt },
      skills: [skill(0)],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    expect(t.pins).toEqual(["dist-2026-09-01"]);

    // Second boot-equivalent: the run never moved, but a manual retry (or a
    // source switch) must still fetch rather than report "nothing to do".
    t.controller.reload({ cdnBase: "other" });
    await t.flush();
    expect(t.pins).toEqual(["dist-2026-09-01", "dist-2026-09-01"]);
  });

  it("falls back to the branch ref when no meta can be reached", async () => {
    const t = setup({
      cache: {
        load: async () => record([skill(0)], "2026-09-01T14:25:32Z"),
        save: async () => {},
        clear: async () => {},
      },
      published: null,
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Nothing to compare against: download unpinned instead of trusting a
    // tag that may no longer be current.
    expect(t.pins).toEqual([undefined]);
  });

  it("throttles progress notifications by wall clock", async () => {
    let clock = 1000;
    const t = setup({ now: () => clock });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // The leading edge notifies immediately; notifications inside the
    // throttle window are dropped.
    t.push(skill(0));
    t.push(skill(1));
    clock += 100;
    t.push(skill(2));
    expect(t.recorded.progress.map((p) => p.count)).toEqual([1]);

    clock += 500; // past PROGRESS_INTERVAL_MS
    t.push(skill(3));
    expect(t.recorded.progress.map((p) => p.count)).toEqual([1, 4]);
  });
});

describe("createRegistryController — revalidate", () => {
  /**
   * The harness reads the source config lazily on every probe, so passing the
   * object itself (rather than a copy) lets a test publish a new snapshot
   * mid-run — which is exactly the situation this check exists for.
   */
  type SourceOptions = NonNullable<Parameters<typeof setup>[0]>;

  it("downloads nothing and dates the check when the run is unchanged", async () => {
    let clock = 0;
    const generatedAt = "2026-09-01T14:25:32Z";
    const t = setup({
      now: () => clock,
      cache: {
        load: async () => record([skill(0)], generatedAt),
        save: async () => {},
        clear: async () => {},
      },
      published: { tag: "dist-2026-09-01", generatedAt, total: 1 },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    expect(t.pins).toEqual([]);

    clock = 5_000;
    void t.controller.revalidate({ id: 1 });
    await t.flush();

    expect(t.pins).toEqual([]);
    expect(resultData<RevalidateResult>(t.recorded.results.at(-1)!)).toEqual({
      status: "current",
    });
    // The check is dated, which is what starts the freshness window.
    expect(t.recorded.indexes.at(-1)?.info).toMatchObject({
      origin: "unchanged",
      checkedAt: 5_000,
    });
  });

  it("pulls in the newer run when the published stamp moved", async () => {
    const options: SourceOptions = {
      skills: [skill(0)],
      published: {
        tag: "dist-2026-09-01",
        generatedAt: "2026-09-01T00:00:00Z",
        total: 1,
      },
    };
    const t = setup(options);
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    expect(t.pins).toEqual(["dist-2026-09-01"]);

    // A new day publishes while the app stays open.
    options.published = {
      tag: "dist-2026-09-02",
      generatedAt: "2026-09-02T00:00:00Z",
      total: 1,
    };
    void t.controller.revalidate({ id: 1 });
    await t.flush();

    expect(t.pins).toEqual(["dist-2026-09-01", "dist-2026-09-02"]);
    expect(resultData<RevalidateResult>(t.recorded.results.at(-1)!)).toEqual({
      status: "updated",
    });
  });

  it("downloads nothing when the probe cannot answer", async () => {
    const generatedAt = "2026-09-01T14:25:32Z";
    const options: SourceOptions = {
      published: { tag: "dist-2026-09-01", generatedAt, total: 1 },
      cache: {
        load: async () => record([skill(0)], generatedAt),
        save: async () => {},
        clear: async () => {},
      },
    };
    const t = setup(options);
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    expect(t.pins).toEqual([]);

    // The tag listing is unreachable now. Boot and a forced reload fall back
    // to the mutable branch here; a periodic check must not — that would pull
    // the whole multi-megabyte index on a probe that answered nothing.
    options.published = null;
    void t.controller.revalidate({ id: 1 });
    await t.flush();

    expect(t.pins).toEqual([]);
    expect(resultData<RevalidateResult>(t.recorded.results.at(-1)!)).toEqual({
      status: "unknown",
    });
  });
});

describe("createRegistryController — searchSkills", () => {
  it("answers in the index's own relevance order", async () => {
    const t = setup({
      skills: [
        // Equally relevant to "redis"; only the install boost separates them.
        { ...skill(0), name: "zeta-redis", repo: "acme/zeta", downloads: 100 },
        { ...skill(1), name: "alpha-redis", repo: "acme/alpha", downloads: 1 },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "searchSkills",
      id: 1,
      payload: { query: "redis" },
    });
    // Popularity is the ranking's own tie-break, so the more-installed namesake
    // leads: nothing about a search answer is configurable by the caller.
    const hits = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[0],
    );
    expect(hits.hits.map((h) => h.skill.name)).toEqual([
      "zeta-redis",
      "alpha-redis",
    ]);
  });

  it("caps a broad query so one reply stays page-sized", async () => {
    const t = setup({
      skills: Array.from({ length: 55 }, (_, i) =>
        skill(i, { name: `tool-${i}`, repo: `acme/tool-${i}` }),
      ),
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "searchSkills",
      id: 1,
      payload: { query: "tool" },
    });
    const hits = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[0],
    );
    // Every one of the 55 matches, but the boundary never carries more than a
    // page's worth: a consumer that needs more narrows the query.
    expect(hits.hits).toHaveLength(50);
  });

  it("answers no search until the index over the registry is built", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.push({ ...skill(0), name: "gadget-master", repo: "acme/gadgets" });
    t.push({ ...skill(1), name: "tool-a", repo: "acme/tools" });

    // Mid-stream there is no index over the registry to rank against, so a
    // query is answered with nothing rather than a guess over the prefix; the
    // main thread keeps its search field disabled until `ready`.
    t.controller.handle({
      type: "searchSkills",
      id: 1,
      payload: { query: "gadget" },
    });
    expect(resultData(t.recorded.results[0])).toEqual({ hits: [] });

    t.complete();
    await t.flush();

    // Indexed: the query is answered by the search index, along with a prefix
    // of it. A typo is not — the shared entry point forgives nothing.
    t.controller.handle({
      type: "searchSkills",
      id: 2,
      payload: { query: "gadget" },
    });
    expect(
      resultData<{ hits: Array<{ skill: Skill }> }>(
        t.recorded.results[1],
      ).hits.map((h) => h.skill.name),
    ).toEqual(["gadget-master"]);

    t.controller.handle({
      type: "searchSkills",
      id: 3,
      payload: { query: "gadget-m" },
    });
    expect(
      resultData<{ hits: Array<{ skill: Skill }> }>(
        t.recorded.results[2],
      ).hits.map((h) => h.skill.name),
    ).toEqual(["gadget-master"]);

    t.controller.handle({
      type: "searchSkills",
      id: 4,
      payload: { query: "gadgt" },
    });
    expect(resultData(t.recorded.results[3])).toEqual({ hits: [] });
  });
});

describe("createRegistryController — getGroups", () => {
  it("groups the browse list by repository, ordered by stars", async () => {
    const t = setup({
      skills: [
        skill(0, { repo: "o/big", stars: 500, name: "big-b" }),
        skill(1, { repo: "o/big", stars: 500, name: "big-a" }),
        skill(2, { repo: "o/none", stars: 0, name: "none" }),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "", groupBy: "repo" },
    });
    const data = resultData<{
      groups: Array<{
        key: string;
        title: string;
        avatarOwner?: string;
        stars?: number;
        skills: Array<{ skill: Skill }>;
      }>;
      total: number;
      groupCounts: { repo: number; popularity: number; domain: number };
    }>(t.recorded.results[0]);

    // The starred repository's group leads; the starless one follows — even
    // though its lone skill is the most installed (its downloads ride the
    // skill(2) factory). Group order reads the figure the header shows.
    expect(data.groups.map((g) => g.title)).toEqual(["o/big", "o/none"]);
    expect(data.total).toBe(3);
    expect(data.groups[0].stars).toBe(500);
    expect(data.groups[1].stars).toBe(0);
    // The header's identity rides along: the owner for the avatar.
    expect(data.groups[0].avatarOwner).toBe("o");
    expect(data.groups[0].key).toBe("repo-o/big");
    // Skills inside a group keep the popularity order.
    expect(data.groups[0].skills.map((h) => h.skill.name)).toEqual([
      "big-b",
      "big-a",
    ]);
    // The answer carries every mode's group count over the same hits, for
    // the dropdown's annotations: two repos, one 50-sized bucket, one domain
    // (nothing is profiled here, so all skills pool into 未分类).
    expect(data.groupCounts).toEqual({ repo: 2, popularity: 1, domain: 1 });
  });

  it("chunks the popularity grouping into fixed-size rank buckets", async () => {
    // 120 skills with strictly decreasing popularity (both counts slide down
    // with the index), so the global rank r is exactly skill-r and the
    // buckets tile the ranking 50/50/20.
    const t = setup({
      skills: Array.from({ length: 120 }, (_, i) =>
        skill(i, { stars: 1000 - i, downloads: 1000 - i }),
      ),
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "", groupBy: "popularity" },
    });
    const data = resultData<{
      groups: Array<{ key: string; title: string; skills: Array<{ skill: Skill }> }>;
      total: number;
    }>(t.recorded.results[0]);

    expect(data.groups.map((g) => g.title)).toEqual([
      "TOP 1-50",
      "TOP 51-100",
      "TOP 101-120",
    ]);
    expect(data.groups.map((g) => g.key)).toEqual(["pop-0", "pop-50", "pop-100"]);
    // Bucket order is rank order: the first bucket holds the top of the list.
    expect(data.groups[0].skills[0].skill.name).toBe("skill-0");
    expect(data.groups[2].skills[0].skill.name).toBe("skill-100");
    expect(data.total).toBe(120);
  });

  it("groups by domain, pooling the unclassified into 未分类", async () => {
    const t = setup({
      skills: [
        { ...skill(0), profile: { domain: ["development"] } },
        { ...skill(1), profile: { domain: ["content-creation"] } },
        { ...skill(2), profile: { domain: ["development"] } },
        skill(3),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "", groupBy: "domain" },
    });
    const data = resultData<{
      groups: Array<{
        title: string;
        emoji?: string;
        skills: Array<{ skill: Skill }>;
      }>;
      total: number;
    }>(t.recorded.results[0]);

    // Most-populated domain first; skill-3 carries no profile and still
    // shows up, pooled into its own group (the equal-sized tie resolves
    // alphabetically).
    expect(data.groups.map((g) => g.title)).toEqual([
      "开发编程",
      "内容创作",
      "未分类",
    ]);
    // Skills inside a group keep the popularity order (skill-2 outranks
    // skill-0 under the blend).
    expect(data.groups[0].skills.map((h) => h.skill.name)).toEqual([
      "skill-2",
      "skill-0",
    ]);
    expect(data.groups[1].skills.map((h) => h.skill.name)).toEqual([
      "skill-1",
    ]);
    expect(data.groups[2].skills.map((h) => h.skill.name)).toEqual([
      "skill-3",
    ]);
    expect(data.total).toBe(4);
  });

  it("places a multi-domain skill in each of its domain groups", async () => {
    const t = setup({
      skills: [
        {
          ...skill(0),
          profile: { domain: ["development", "content-creation"] },
        },
        { ...skill(1), profile: { domain: ["development"] } },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "", groupBy: "domain" },
    });
    const data = resultData<{
      groups: Array<{ title: string; skills: Array<{ skill: Skill }> }>;
    }>(t.recorded.results[0]);

    // One skill, two groups — the multi-domain case a single-domain model
    // could not express.
    expect(data.groups.map((g) => g.title)).toEqual([
      "开发编程",
      "内容创作",
    ]);
    // Within-group order is the popularity blend, so compare as a set.
    expect(
      data.groups[0].skills.map((h) => h.skill.name).toSorted(),
    ).toEqual(["skill-0", "skill-1"]);
    expect(data.groups[1].skills.map((h) => h.skill.name)).toEqual(["skill-0"]);
  });

  it("groups search hits with the best match leading its group", async () => {
    const t = setup({
      skills: [
        skill(0, {
          name: "redis-clip",
          repo: "o/clip",
          stars: 1000,
          downloads: 1000,
        }),
        skill(1, { name: "redis-tool", repo: "o/tool" }),
        skill(2, { name: "redis-lab", repo: "o/clip" }),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "redis", groupBy: "repo" },
    });
    const data = resultData<{
      groups: Array<{ title: string; skills: Array<{ skill: Skill }> }>;
      total: number;
    }>(t.recorded.results[0]);

    // Group order follows the relevance order of the groups' best hits; the
    // popular clip leads its group (the ranking's popularity boost) and the
    // lesser lab trails it.
    expect(data.groups.map((g) => g.title)).toEqual(["o/clip", "o/tool"]);
    expect(data.groups[0].skills.map((h) => h.skill.name)).toEqual([
      "redis-clip",
      "redis-lab",
    ]);
    expect(data.total).toBe(3);
  });

  it("answers an empty shape before the search index exists", async () => {
    const t = setup({ skills: [skill(0)] });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "anything", groupBy: "repo" },
    });
    const data = resultData<{
      groups: unknown[];
      total: number;
      groupCounts: { repo: number; popularity: number; domain: number };
    }>(t.recorded.results[0]);
    expect(data).toEqual({
      groups: [],
      total: 0,
      groupCounts: { repo: 0, popularity: 0, domain: 0 },
    });
  });
});

describe("createRegistryController — featured + lookup", () => {
  it("computes hero slides and resolves the curated sections", async () => {
    const t = setup({
      skills: [
        { ...skill(0), name: "alpha", repo: "acme/alpha", downloads: 500 },
        { ...skill(1), name: "beta", repo: "acme/beta", downloads: 100 },
      ],
      // Upstream rank order differs from the downloads order — trending wins.
      trending: ["acme/beta/beta", "acme/alpha/alpha"],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const data = resultData<{
      slides: Array<{ id: string; entries: Array<{ skill: Skill }> }>;
      sections: Array<{ id: string; skills: Skill[] }>;
    }>(t.recorded.results[0]);
    // The trending board exists and follows the upstream id order.
    const trending = data.slides.find((s) => s.id === "trending");
    expect(trending?.entries.map((e) => e.skill.name)).toEqual([
      "beta",
      "alpha",
    ]);
    // Curated references resolve against the registry by identity, in
    // curation order, and unresolved ones are dropped — the sections carry the
    // skills themselves because the detail drawer walks them by identity.
    expect(
      data.sections.map((section) =>
        section.skills.map((entry) => `${entry.repo}/${entry.name}`),
      ),
    ).toEqual([
      ["acme/alpha/alpha", "acme/beta/beta"],
      ["acme/alpha/alpha"],
    ]);
  });

  it("omits the trending slide when no trending list was served", async () => {
    const t = setup({
      skills: [{ ...skill(0), name: "alpha", repo: "acme/alpha" }],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const data = resultData<{
      slides: Array<{ id: string }>;
    }>(t.recorded.results[0]);

    expect(data.slides.map((s) => s.id)).toEqual(["popular"]);
  });

  it("resolves installed-skill refs by name and by path basename", async () => {
    const t = setup({
      skills: [
        {
          ...skill(0),
          name: "alpha",
          repo: "acme/alpha",
          path: "skills/alpha-skill",
        },
        { ...skill(1), name: "beta", repo: "acme/beta" },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "lookupSkills",
      id: 1,
      payload: {
        refs: [
          { repo: "acme/alpha", name: "alpha-skill" }, // path basename match
          { repo: "acme/beta", name: "beta" }, // exact match
          { repo: "acme/missing", name: "nope" }, // miss
        ],
      },
    });
    const result = t.recorded.results[0];
    const entries = resultData<{ entries: Array<Skill | null> }>(
      result,
    ).entries;
    expect(entries[0]?.name).toBe("alpha");
    expect(entries[1]?.name).toBe("beta");
    expect(entries[2]).toBeNull();
  });

  it("keeps the first in-store match when name and basename both hit a key", async () => {
    // A skill whose path basename collides with a later skill's name: the
    // index mirrors a `store.find` — the earliest skill satisfying repo +
    // (name || basename) wins, whichever of the two it matched by.
    const t = setup({
      skills: [
        {
          ...skill(0),
          name: "alpha",
          repo: "acme/alpha",
          path: "skills/rename-me",
        },
        {
          ...skill(1),
          name: "rename-me",
          repo: "acme/alpha",
          path: "skills/alpha",
        },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "lookupSkills",
      id: 1,
      payload: { refs: [{ repo: "acme/alpha", name: "rename-me" }] },
    });
    const entries = resultData<{ entries: Array<Skill | null> }>(
      t.recorded.results[0],
    ).entries;
    expect(entries[0]?.name).toBe("alpha");
  });

  it("rebuilds the lookup index as the registry lands", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Mid-stream: only the loaded prefix answers (no stale cache from a
    // previous data version).
    t.push({ ...skill(0), name: "alpha", repo: "acme/alpha" });
    t.controller.handle({
      type: "lookupSkills",
      id: 1,
      payload: { refs: [{ repo: "acme/alpha", name: "alpha" }] },
    });
    let entries = resultData<{ entries: Array<Skill | null> }>(
      t.recorded.results[0],
    ).entries;
    expect(entries[0]?.name).toBe("alpha");

    t.push({ ...skill(1), name: "beta", repo: "acme/beta" });
    t.controller.handle({
      type: "lookupSkills",
      id: 2,
      payload: { refs: [{ repo: "acme/beta", name: "beta" }] },
    });
    entries = resultData<{ entries: Array<Skill | null> }>(
      t.recorded.results[1],
    ).entries;
    expect(entries[0]?.name).toBe("beta");
  });
});

describe("createRegistryController — getRanking", () => {
  /** Boot a complete registry of `n` ranked skills (skill-0 leads). */
  async function boot(n: number, trending?: string[] | null) {
    const t = setup({
      skills: Array.from({ length: n }, (_, i) =>
        skill(i, { downloads: (n - i) * 1_000 }),
      ),
      trending,
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    return t;
  }

  it("returns the trending leaderboard in upstream order", async () => {
    // Upstream ranks the *least* downloaded skill first: its order, not the
    // registry's, decides the leaderboard.
    // skill(2) lives in owner-2/repo-0 (the factory's repo = i % 2).
    const t = await boot(3, [
      "owner-2/repo-0/skill-2",
      "owner-0/repo-0/skill-0",
      "missing/repo/x",
    ]);

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "trending" },
    });
    const data = resultData<{
      id: string;
      entries: Array<{ rank: number; skill: Skill; label: string }>;
      total: number;
    }>(t.recorded.results[0]);

    expect(data.id).toBe("trending");
    expect(data.entries.map((e) => e.skill.name)).toEqual([
      "skill-2",
      "skill-0",
    ]);
    expect(data.entries.map((e) => e.rank)).toEqual([1, 2]);
    // Upstream decides the order; the number is the row metric (1000 installs
    // against 2 stars scores 54), not the install count.
    expect(data.entries[0].label).toBe("54");
    expect(data.total).toBe(2);
  });

  it("returns the popular leaderboard ranked, truncated and counted", async () => {
    const t = await boot(150);

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "popular" },
    });
    const data = resultData<{
      id: string;
      entries: Array<{ rank: number; skill: Skill; label: string }>;
      total: number;
    }>(t.recorded.results[0]);

    expect(data.id).toBe("popular");
    // Truncated to the page size, but counted in full.
    expect(data.entries).toHaveLength(100);
    expect(data.total).toBe(150);
    // Each label is the row metric, and the ranks follow it descending. Which
    // skill leads is the metric's business (see popularity.test.ts), so this
    // asserts the wiring rather than one tie-prone name.
    const values = data.entries.map((e) => popularity(e.skill));
    expect(data.entries.map((e) => e.label)).toEqual(values.map(formatCount));
    expect(values).toEqual([...values].toSorted((a, b) => b - a));
    expect(data.entries[0]).toMatchObject({ rank: 1 });
    expect(data.entries[99]).toMatchObject({ rank: 100 });
  });

  it("carries the leaderboard's own presentation", async () => {
    const t = await boot(5);

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "popular" },
    });
    const data = resultData<{ title: string; gradient: string }>(
      t.recorded.results[0],
    );

    expect(data.title).toBe("人气总榜");
    expect(data.gradient).toContain("gradient");
  });

  it("answers with an empty leaderboard instead of failing", async () => {
    // No trending list was served, so the trending board has no entries.
    const t = await boot(5, null);

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "trending" },
    });
    const data = resultData<{ entries: unknown[]; total: number }>(
      t.recorded.results[0],
    );

    expect(data.entries).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("rejects an unknown leaderboard id", async () => {
    const t = await boot(5);

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "nope" },
    });

    expect(t.recorded.results[0]).toMatchObject({
      ok: false,
      id: 1,
      error: "未知榜单：nope",
    });
  });
});

describe("createRegistryController — failures", () => {
  it("resets to an empty registry and surfaces the error without prior data", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.push(skill(0));
    t.fail(new Error("network error"));
    await t.flush();

    expect(t.recorded.errors.map((e) => e.message)).toEqual(["network error"]);
    expect(t.controller.stats()).toMatchObject({
      count: 0,
      complete: false,
      ready: false,
    });
    // Nothing is served, so no snapshot identity is claimed.
    expect(t.controller.stats().index).toBeNull();
  });

  it("keeps serving prior data when a revalidation fails", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Land the first full dataset over a manual stream...
    t.push(skill(0));
    t.push(skill(1));
    t.complete();
    await t.flush();
    expect(t.controller.stats().ready).toBe(true);

    // ...then a manual retry (reload) that fails must not blank it.
    t.controller.reload({ cdnBase: "test" });
    await t.flush();
    t.fail(new Error("network error"));
    await t.flush();

    expect(t.recorded.errors.at(-1)?.message).toBe("network error");
    expect(t.controller.stats()).toMatchObject({ count: 2, ready: true });
  });

  it("ignores results of a superseded download", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Start streaming generation 1, then switch sources mid-stream.
    t.push(skill(0));
    t.controller.reload({ cdnBase: "test" });
    await t.flush();

    // The stale (generation 1) stream completes after the reload: it must
    // not land, and no ready may be reported for it.
    t.complete(-2);
    await t.flush();

    // Only the fresh (still-open) generation counts; no ready was posted for
    // the stale stream's single skill.
    expect(t.recorded.readyCount).toBe(0);
    expect(t.controller.stats().complete).toBe(false);
  });
});

describe("createRegistryController — classification", () => {
  /** A skill carrying the classification its index row shipped. */
  const classified = (i: number, domain: string[]): Skill =>
    skill(i, { profile: { domain } });

  it("buckets the browsed list by each skill's own classification", async () => {
    // skill-2 belongs to both domains, so a group has to match by membership
    // rather than by an exact classification — and the skill lands in each of
    // its groups.
    const t = setup({
      skills: [
        classified(0, ["development"]),
        classified(1, ["content-creation"]),
        classified(2, ["development", "content-creation"]),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "", groupBy: "domain" },
    });
    const data = resultData<GroupsData>(t.recorded.results[0]);
    expect(
      data.groups.map((g) => [
        g.key,
        g.skills.map((h) => h.skill.name).toSorted(),
      ]),
    ).toEqual([
      // Both buckets hold two skills, so the alphabetical tie-break decides.
      ["domain-content-creation", ["skill-1", "skill-2"]],
      ["domain-development", ["skill-0", "skill-2"]],
    ]);
    // The grouping dropdown's annotations count the same buckets.
    expect(data.groupCounts.domain).toBe(2);
    // The classification rides along on the served rows themselves.
    const multi = data.groups[0].skills.find((h) => h.skill.name === "skill-2");
    expect(multi?.skill.profile).toEqual({
      domain: ["development", "content-creation"],
    });
  });

  it("groups a search's hits by domain too", async () => {
    const t = setup({
      skills: [
        classified(0, ["development"]),
        classified(1, ["content-creation"]),
        skill(2), // classified under nothing: it has to land in the pool
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "skill", groupBy: "domain" },
    });
    const data = resultData<GroupsData>(t.recorded.results[0]);
    const byKey = new Map(
      data.groups.map((g) => [g.key, g.skills.map((h) => h.skill.name)]),
    );
    expect([...byKey.keys()].toSorted()).toEqual([
      "domain-content-creation",
      "domain-development",
      "domain-未分类",
    ]);
    expect(byKey.get("domain-未分类")).toEqual(["skill-2"]);
    expect(data.total).toBe(3);
  });

  it("keeps the registry usable when nothing is classified", async () => {
    const t = setup({ skills: [skill(0), skill(1)] });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Ready fired exactly once and no skill carries a profile: the domain
    // grouping still answers, with every skill pooled under 未分类.
    expect(t.recorded.readyCount).toBe(1);
    t.controller.handle({
      type: "getGroups",
      id: 1,
      payload: { query: "", groupBy: "domain" },
    });
    const data = resultData<GroupsData>(t.recorded.results[0]);
    expect(data.groups.map((g) => g.title)).toEqual(["未分类"]);
    expect(data.groupCounts).toEqual({ repo: 2, popularity: 1, domain: 1 });
  });

  it("builds featured sections from the real domains", async () => {
    const t = setup({
      skills: [
        classified(0, ["development"]),
        classified(1, ["development"]),
        classified(2, ["content-creation"]),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const featured = resultData<{
      sections: Array<{ id: string; skills: Skill[] }>;
    }>(t.recorded.results[0]);

    // Sections are the real domains, most-populated first, skills within a
    // section led by the most installed.
    expect(featured.sections.map((s) => s.id)).toEqual([
      "development",
      "content-creation",
    ]);
    expect(featured.sections[0].skills.map((s) => s.name)).toEqual([
      "skill-0",
      "skill-1",
    ]);
    expect(featured.sections[1].skills.map((s) => s.name)).toEqual([
      "skill-2",
    ]);
  });

  it("skips the catch-all domain when leading the featured sections", async () => {
    const t = setup({
      skills: [
        classified(0, ["development"]),
        classified(1, ["other"]),
        skill(2),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const featured = resultData<{
      sections: Array<{ id: string; skills: Skill[] }>;
    }>(t.recorded.results[0]);

    // "other" classifies nothing on its own, so it never leads a section.
    expect(featured.sections.map((s) => s.id)).toEqual(["development"]);
  });

  it("falls back to curated featured sections when nothing is classified", async () => {
    // Skills shaped to match the mocked FEATURED_CATEGORIES refs, but with no
    // classification: the domain sections cannot be built, so the hand-curated
    // ones answer instead.
    const t = setup({
      skills: [
        { ...skill(0), name: "alpha", repo: "acme/alpha" },
        { ...skill(1), name: "beta", repo: "acme/beta" },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const featured = resultData<{
      sections: Array<{ id: string; skills: Skill[] }>;
    }>(t.recorded.results[0]);

    expect(featured.sections.map((s) => s.id)).toEqual([
      "curated",
      "curated-2",
    ]);
    expect(featured.sections[0].skills.map((s) => s.name)).toEqual([
      "alpha",
      "beta",
    ]);
  });
});
