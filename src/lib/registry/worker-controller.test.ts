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
import type { ProfilesMeta } from "./profiles";
import type {
  RegistryWorkerMessage,
  RepoSortOrder,
  ReposRequest,
  RevalidateResult,
  SortOrder,
} from "./protocol";
import type { Skill, SkillProfile } from "../../types/skill";
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
   * What the profiles source serves; null (default) = file unreachable.
   * Its stamp is advertised through `profilesMeta` when set.
   */
  profiles?: Map<string, SkillProfile> | null;
  /** What the profiles probe advertises; null (default) = probe failed. */
  profilesMeta?: ProfilesMeta | null;
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
      readProfilesMeta: async () => options?.profilesMeta ?? null,
      readProfiles: async () => {
        if (!options?.profiles) throw new Error("profiles unavailable");
        return options.profiles;
      },
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

  it("reports updated when only the profiles dataset moved", async () => {
    const generatedAt = "2026-09-01T14:25:32Z";
    const before = "2026-09-10T07:22:00Z";
    const after = "2026-09-11T07:22:00Z";
    const options: SourceOptions = {
      published: { tag: "dist-2026-09-01", generatedAt, total: 1 },
      profilesMeta: { generatedAt: before },
      profiles: new Map([["owner-0/repo-0/skill-0", { domain: "开发编程" }]]),
      cache: {
        load: async () => ({
          ...record([skill(0)], generatedAt),
          profilesAt: before,
        }),
        save: async () => {},
        clear: async () => {},
      },
    };
    const t = setup(options);
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    // Both snapshots are the ones already served: nothing was fetched.
    expect(t.pins).toEqual([]);

    // The profiles dataset moves on its own schedule, independent of the
    // registry index it decorates.
    options.profilesMeta = { generatedAt: after };
    void t.controller.revalidate({ id: 1 });
    await t.flush();

    expect(t.pins).toEqual([]);
    expect(resultData<RevalidateResult>(t.recorded.results.at(-1)!)).toEqual({
      status: "updated",
    });
    expect(t.recorded.indexes.at(-1)?.info).toMatchObject({ profilesAt: after });
  });
});

describe("createRegistryController — getPage", () => {
  it("pages the browse list in registry order", async () => {
    const t = setup({ skills: [skill(0), skill(1), skill(2)] });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    const page0 = t.controller.handle({
      type: "getPage",
      id: 1,
      payload: { query: "", sort: "default", page: 0, pageSize: 2 },
    });
    const page1 = t.controller.handle({
      type: "getPage",
      id: 2,
      payload: { query: "", sort: "default", page: 1, pageSize: 2 },
    });

    expect(resultData<{ total: number }>(t.recorded.results[0]).total).toBe(3);
    expect(page1).toBeUndefined(); // handle returns nothing; results are posted
    expect(resultData<{ total: number }>(t.recorded.results[1]).total).toBe(3);
    expect(page0).toBeUndefined();
  });

  it("sorts by popularity and by name with per-version caching", async () => {
    const t = setup({
      // Installs fall with the index (100, 99, 98) while stars rise (0, 1, 2),
      // so the blended figure orders these three the opposite way round.
      skills: [skill(0), skill(1), skill(2)],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getPage",
      id: 1,
      payload: { query: "", sort: "popularity", page: 0, pageSize: 3 },
    });
    const byPopularity = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[0],
    );
    expect(byPopularity.hits.map((h) => h.skill.name)).toEqual([
      "skill-2",
      "skill-1",
      "skill-0",
    ]);

    t.controller.handle({
      type: "getPage",
      id: 2,
      payload: { query: "", sort: "name", page: 0, pageSize: 3 },
    });
    const byName = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[1],
    );
    expect(byName.hits.map((h) => h.skill.name)).toEqual([
      "skill-0",
      "skill-1",
      "skill-2",
    ]);
  });

  it("answers a search in relevance order whatever sort is asked for", async () => {
    const t = setup({
      skills: [
        // Equally relevant to "redis"; only the install boost separates them.
        { ...skill(0), name: "zeta-redis", repo: "acme/zeta", downloads: 100 },
        { ...skill(1), name: "alpha-redis", repo: "acme/alpha", downloads: 1 },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    const searchNames = (sort: SortOrder, index: number) => {
      t.controller.handle({
        type: "getPage",
        id: index + 1,
        payload: { query: "redis", sort, page: 0, pageSize: 5 },
      });
      return resultData<{ hits: Array<{ skill: Skill }> }>(
        t.recorded.results[index],
      ).hits.map((h) => h.skill.name);
    };

    // The requested sort changes nothing about a search's order: the ranking is
    // what made these two match, and the install boost is part of that ranking.
    expect(searchNames("default", 0)).toEqual([
      "zeta-redis",
      "alpha-redis",
    ]);
    expect(searchNames("name", 1)).toEqual(["zeta-redis", "alpha-redis"]);

    // The browsed list, by contrast, does honour the sort — and its name order
    // is the opposite of the search's, which is what this pairing proves.
    t.controller.handle({
      type: "getPage",
      id: 3,
      payload: { query: "", sort: "name", page: 0, pageSize: 5 },
    });
    expect(
      resultData<{ hits: Array<{ skill: Skill }> }>(
        t.recorded.results[2],
      ).hits.map((h) => h.skill.name),
    ).toEqual(["alpha-redis", "zeta-redis"]);
  });

  it("filters exactly by repo for the repo detail page", async () => {
    const t = setup({
      skills: [
        skill(0), // owner-0/repo-0
        skill(1), // owner-1/repo-1
        skill(3), // owner-0/repo-1
        skill(6), // owner-0/repo-0
      ],
    });
    t.controller.init({ cdnBase: "test" });
    t.complete();
    await t.flush();

    t.controller.handle({
      type: "getPage",
      id: 1,
      payload: {
        query: "no-match-on-purpose",
        repo: "owner-0/repo-0",
        sort: "default",
        page: 0,
        pageSize: 10,
      },
    });
    const data = resultData<{ hits: Array<{ skill: Skill }>; total: number }>(
      t.recorded.results[0],
    );
    // An exact identity filter, not a search: only that repo's skills, the
    // query text ignored.
    expect(data.total).toBe(2);
    expect(data.hits.map((h) => h.skill.name)).toEqual(["skill-0", "skill-6"]);
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
      type: "getPage",
      id: 1,
      payload: { query: "gadget", sort: "default", page: 0, pageSize: 5 },
    });
    const midStream = resultData<{ hits: unknown[]; total: number }>(
      t.recorded.results[0],
    );
    expect(midStream).toEqual({ hits: [], total: 0 });

    t.complete();
    await t.flush();

    // Indexed: the query — and a typo of it — are answered by the fuzzy index.
    t.controller.handle({
      type: "getPage",
      id: 2,
      payload: { query: "gadget", sort: "default", page: 0, pageSize: 5 },
    });
    const exact = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[1],
    );
    expect(exact.hits.map((h) => h.skill.name)).toEqual(["gadget-master"]);

    t.controller.handle({
      type: "getPage",
      id: 3,
      payload: { query: "gadgt", sort: "default", page: 0, pageSize: 5 },
    });
    const fuzzy = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[2],
    );
    expect(fuzzy.hits[0].skill.name).toBe("gadget-master");
  });
});

describe("createRegistryController — featured + lookup", () => {
  it("computes hero slides and resolves curated sections with global indexes", async () => {
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
      sections: Array<{ skills: Array<{ index: number }> }>;
    }>(t.recorded.results[0]);
    // The trending board exists and follows the upstream id order.
    const trending = data.slides.find((s) => s.id === "trending");
    expect(trending?.entries.map((e) => e.skill.name)).toEqual([
      "beta",
      "alpha",
    ]);
    // Curated sections number their rows globally for the detail panel.
    const indexes = data.sections.flatMap((s) => s.skills.map((x) => x.index));
    expect(indexes).toEqual(indexes.toSorted((a, b) => a - b));
    expect(indexes[0]).toBe(0);
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

describe("createRegistryController — getRepos", () => {
  // Four skills across three repos: alpha has 2 skills (10 stars),
  // beta 1 skill (5 stars), git/x 1 skill (1 star).
  const reposSkills: Skill[] = [
    { ...skill(0), name: "a1", repo: "acme/alpha", downloads: 50, stars: 10 },
    { ...skill(1), name: "a2", repo: "acme/alpha", downloads: 30, stars: 10 },
    { ...skill(2), name: "b1", repo: "acme/beta", downloads: 100, stars: 5 },
    { ...skill(3), name: "g1", repo: "git/x", downloads: 1, stars: 1 },
  ];

  async function reposSetup(skills: Skill[]) {
    const t = setup({ skills });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    return t;
  }

  function requestRepos(t: ReturnType<typeof setup>, payload: ReposRequest) {
    const before = t.recorded.results.length;
    t.controller.handle({ type: "getRepos", id: before + 1, payload });
    return resultData<{ repos: Array<{ repo: string }>; total: number }>(
      t.recorded.results[before],
    );
  }

  it("aggregates per-repo skill counts and stars", async () => {
    const t = await reposSetup(reposSkills);
    const data = requestRepos(t, {
      query: "",
      sort: "stars",
      page: 0,
      pageSize: 10,
    });
    expect(data.total).toBe(3);
    // Star order: most stars first, repo name as the tie-break.
    expect(data.repos).toEqual([
      { repo: "acme/alpha", skills: 2, stars: 10 },
      { repo: "acme/beta", skills: 1, stars: 5 },
      { repo: "git/x", skills: 1, stars: 1 },
    ]);
  });

  it("filters by case-insensitive repo substring", async () => {
    const t = await reposSetup(reposSkills);
    expect(
      requestRepos(t, {
        query: "ACME",
        sort: "stars",
        page: 0,
        pageSize: 10,
      }).total,
    ).toBe(2);
    expect(
      requestRepos(t, {
        query: "beta",
        sort: "stars",
        page: 0,
        pageSize: 10,
      }).repos[0]?.repo,
    ).toBe("acme/beta");
  });

  it("sorts by stars, skills and name", async () => {
    const t = await reposSetup(reposSkills);
    const names = (sort: RepoSortOrder) =>
      requestRepos(t, { query: "", sort, page: 0, pageSize: 10 }).repos.map(
        (r) => r.repo,
      );
    expect(names("stars")).toEqual(["acme/alpha", "acme/beta", "git/x"]);
    expect(names("skills")).toEqual(["acme/alpha", "acme/beta", "git/x"]);
    expect(names("name")).toEqual(["acme/alpha", "acme/beta", "git/x"]);
  });

  it("pages the repo list", async () => {
    const t = await reposSetup(reposSkills);
    const page0 = requestRepos(t, {
      query: "",
      sort: "stars",
      page: 0,
      pageSize: 2,
    });
    const page1 = requestRepos(t, {
      query: "",
      sort: "stars",
      page: 1,
      pageSize: 2,
    });
    expect(page0.repos.map((r) => r.repo)).toEqual(["acme/alpha", "acme/beta"]);
    expect(page1.repos.map((r) => r.repo)).toEqual(["git/x"]);
    expect(page1.total).toBe(3);
  });

  it("tracks the loaded prefix while streaming and caches once complete", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Mid-stream: answers reflect the loaded prefix and keep growing (no
    // caching over partial data).
    t.push(reposSkills[0]);
    expect(
      requestRepos(t, { query: "", sort: "stars", page: 0, pageSize: 10 })
        .total,
    ).toBe(1);
    t.push(reposSkills[2]);
    expect(
      requestRepos(t, { query: "", sort: "stars", page: 0, pageSize: 10 })
        .total,
    ).toBe(2);

    t.complete();
    await t.flush();

    // Landed: the settled aggregation answers from the per-version cache.
    expect(
      requestRepos(t, { query: "", sort: "stars", page: 0, pageSize: 10 }),
    ).toMatchObject({
      total: 2,
      repos: [
        { repo: "acme/alpha", skills: 1 },
        { repo: "acme/beta", skills: 1 },
      ],
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

describe("createRegistryController — profiles", () => {
  const PROFILES = new Map<string, SkillProfile>([
    ["owner-0/repo-0/skill-0", { domain: "开发编程", reason: "dev tools" }],
    ["owner-1/repo-1/skill-1", { domain: "内容创作" }],
  ]);

  it("decorates the served skills and reports the domain list", async () => {
    // Two skills share one domain so the count ordering is unambiguous
    // (locale-aware tie-breaks are not asserted).
    const t = setup({
      skills: [skill(0), skill(1), skill(2)],
      profiles: new Map<string, SkillProfile>([
        ["owner-0/repo-0/skill-0", { domain: "开发编程" }],
        ["owner-1/repo-1/skill-1", { domain: "内容创作" }],
        ["owner-2/repo-0/skill-2", { domain: "开发编程" }],
      ]),
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getDomains", id: 1 });
    const domains = resultData<Array<{ domain: string; count: number }>>(
      t.recorded.results[0],
    );
    expect(domains).toEqual([
      { domain: "开发编程", count: 2 },
      { domain: "内容创作", count: 1 },
    ]);

    t.controller.handle({
      type: "getPage",
      id: 2,
      payload: { query: "", sort: "default", page: 0, pageSize: 10 },
    });
    const hits = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[1],
    );
    expect(hits.hits[0].skill.profile).toEqual({ domain: "开发编程" });
    expect(hits.hits[2].skill.profile).toEqual({ domain: "开发编程" });
  });

  it("filters both the browse list and search results by domain", async () => {
    const t = setup({
      skills: [skill(0), skill(1), skill(2)],
      profiles: PROFILES,
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getPage",
      id: 1,
      payload: {
        query: "",
        sort: "default",
        page: 0,
        pageSize: 10,
        domain: "内容创作",
      },
    });
    const browsed = resultData<{
      hits: Array<{ skill: Skill }>;
      total: number;
    }>(t.recorded.results[0]);
    expect(browsed.total).toBe(1);
    expect(browsed.hits[0].skill.name).toBe("skill-1");

    t.controller.handle({
      type: "getPage",
      id: 2,
      payload: {
        query: "skill-",
        sort: "popularity",
        page: 0,
        pageSize: 10,
        domain: "开发编程",
      },
    });
    const searched = resultData<{
      hits: Array<{ skill: Skill }>;
      total: number;
    }>(t.recorded.results[1]);
    expect(searched.total).toBe(1);
    expect(searched.hits[0].skill.name).toBe("skill-0");
  });

  it("keeps the registry usable when the profiles source is unreachable", async () => {
    const t = setup({
      skills: [skill(0), skill(1)],
      profiles: null, // every candidate fails
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // Ready fired exactly once (no profiles rebuild) and no skill carries a
    // profile; the domain list is empty but not an error.
    expect(t.recorded.readyCount).toBe(1);
    t.controller.handle({ type: "getDomains", id: 1 });
    expect(resultData(t.recorded.results[0])).toEqual([]);
  });

  it("revalidates profiles even when the registry index is unchanged", async () => {
    const generatedAt = "2026-09-01T14:25:32Z";
    const saved: Array<[Skill[], Record<string, unknown>]> = [];
    const t = setup({
      cache: {
        load: async () => record([skill(0), skill(1)], generatedAt),
        save: async (skills, identity) => {
          saved.push([skills, identity as Record<string, unknown>]);
        },
        clear: async () => {},
      },
      published: { tag: "dist-2026-09-01", generatedAt, total: 2 },
      profiles: PROFILES,
      profilesMeta: { generatedAt: "2026-09-10T07:22:00Z" },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    // The registry body was skipped, but the profiles still landed: the
    // cached skills are decorated in place and the re-posted ready reflects
    // the refreshed index.
    expect(t.pins).toEqual([]);
    expect(t.recorded.readyCount).toBe(2);
    t.controller.handle({ type: "getDomains", id: 1 });
    // Both domains made it; the tie-break order is locale-dependent.
    const domains = resultData<Array<{ domain: string; count: number }>>(
      t.recorded.results[0],
    );
    expect(domains).toHaveLength(2);
    expect(domains).toEqual(
      expect.arrayContaining([
        { domain: "开发编程", count: 1 },
        { domain: "内容创作", count: 1 },
      ]),
    );
    // The re-save (profiles refresh without a re-download) records the
    // profiles stamp so the next revalidation can skip again.
    expect(saved[0]?.[1]).toMatchObject({
      generatedAt,
      profilesAt: "2026-09-10T07:22:00Z",
    });
  });

  it("builds featured sections from the real domains with curated fallback", async () => {
    const t = setup({
      skills: [skill(0), skill(1), skill(2)],
      profiles: new Map<string, SkillProfile>([
        // skill-0 and skill-1 share a domain; downloads (100-i) order them.
        ["owner-0/repo-0/skill-0", { domain: "开发编程" }],
        ["owner-1/repo-1/skill-1", { domain: "开发编程" }],
        ["owner-2/repo-0/skill-2", { domain: "内容创作" }],
      ]),
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const featured = resultData<{
      sections: Array<{ id: string; skills: Array<{ skill: Skill }> }>;
    }>(t.recorded.results[0]);

    // Sections are the real domains, most-populated first, skills within a
    // section led by the most installed.
    expect(featured.sections.map((s) => s.id)).toEqual([
      "开发编程",
      "内容创作",
    ]);
    expect(featured.sections[0].skills.map((s) => s.skill.name)).toEqual([
      "skill-0",
      "skill-1",
    ]);
    expect(featured.sections[1].skills.map((s) => s.skill.name)).toEqual([
      "skill-2",
    ]);
  });

  it("falls back to curated featured sections when no profiles are served", async () => {
    // Skills shaped to match the mocked FEATURED_CATEGORIES refs, but with
    // no profiles: the domain sections cannot be built, so the hand-curated
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
      sections: Array<{ id: string; skills: Array<{ skill: Skill }> }>;
    }>(t.recorded.results[0]);

    expect(featured.sections.map((s) => s.id)).toEqual([
      "curated",
      "curated-2",
    ]);
    expect(featured.sections[0].skills.map((s) => s.skill.name)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("skips the profiles download when the published stamp is unchanged", async () => {
    // The cold cache was decorated from the same profiles snapshot the probe
    // advertises: no re-fetch happens, so the index is never rebuilt and
    // ready is posted exactly once.
    const cachedSkill: Skill = {
      ...skill(0),
      profile: { domain: "开发编程", reason: "dev tools" },
    };
    const t = setup({
      cache: {
        load: async () => ({
          ...record([cachedSkill], "2026-09-01T14:25:32Z"),
          profilesAt: "2026-09-10T07:22:00Z",
        }),
        save: async () => {},
        clear: async () => {},
      },
      published: {
        tag: "dist-2026-09-01",
        generatedAt: "2026-09-01T14:25:32Z",
        total: 1,
      },
      profilesMeta: { generatedAt: "2026-09-10T07:22:00Z" },
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    expect(t.recorded.readyCount).toBe(1);
    t.controller.handle({
      type: "getPage",
      id: 1,
      payload: { query: "", sort: "default", page: 0, pageSize: 10 },
    });
    const hits = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[0],
    );
    // The cached skill keeps the profile it was saved with.
    expect(hits.hits[0].skill.profile).toEqual({
      domain: "开发编程",
      reason: "dev tools",
    });
  });
});
