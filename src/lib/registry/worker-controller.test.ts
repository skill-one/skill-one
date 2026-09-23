import { describe, it, expect } from "vitest";

import { createRegistryController } from "./worker-controller";
import type { CachedIndex, RegistryCache } from "./cache";
import type { PublishedIndex } from "./index-stream";
import type { RegistryWorkerMessage, RevalidateResult } from "./protocol";
import type { Skill } from "../../types/skill";

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
    // Installs are the ranking's own tie-break, so the more-installed namesake
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
      payload: { query: "" },
    });
    const data = resultData<{
      groups: Array<{
        key: string;
        title: string;
        stars?: number;
        skills: Array<{ skill: Skill }>;
      }>;
      total: number;
    }>(t.recorded.results[0]);

    // The starred repository's group leads; the starless one follows — even
    // though its lone skill is the most installed (its downloads ride the
    // skill(2) factory). Group order reads the figure the card's bar shows.
    expect(data.groups.map((g) => g.title)).toEqual(["o/big", "o/none"]);
    expect(data.total).toBe(3);
    expect(data.groups[0].stars).toBe(500);
    expect(data.groups[1].stars).toBe(0);
    expect(data.groups[0].key).toBe("repo-o/big");
    // Skills inside a group keep the install order.
    expect(data.groups[0].skills.map((h) => h.skill.name)).toEqual([
      "big-b",
      "big-a",
    ]);
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
      payload: { query: "redis" },
    });
    const data = resultData<{
      groups: Array<{ title: string; skills: Array<{ skill: Skill }> }>;
      total: number;
    }>(t.recorded.results[0]);

    // Group order follows the relevance order of the groups' best hits; the
    // popular clip leads its group (the install boost) and the
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
      payload: { query: "anything" },
    });
    const data = resultData<{ groups: unknown[]; total: number }>(
      t.recorded.results[0],
    );
    expect(data).toEqual({ groups: [], total: 0 });
  });
});

describe("createRegistryController — getRepoSections", () => {
  /** A skill filed under the given leads, best fit first. */
  const classified = (
    i: number,
    repo: string,
    domain: string[],
    over: Partial<Skill> = {},
  ) => skill(i, { repo, profile: { domain }, ...over });

  it("files every repository once, biggest section first", async () => {
    const t = setup({
      skills: [
        // Two development skills: the repository leads there twice.
        classified(0, "o/dev", ["development"], { downloads: 100 }),
        classified(1, "o/dev", ["development"], { downloads: 90 }),
        classified(2, "o/test", ["testing"], { downloads: 80 }),
        // A tied lead count (1–1): the heavier development skill decides.
        classified(3, "o/mixed", ["development"], { downloads: 50 }),
        classified(4, "o/mixed", ["testing"], { downloads: 10 }),
        // No profile at all → nobody classified this repository.
        skill(5, { repo: "o/none", downloads: 5 }),
        classified(6, "o/other", ["other"], { downloads: 1 }),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getRepoSections", id: 1 });
    const data = resultData<{
      sections: Array<{ key: string; repos: Array<{ title: string }> }>;
      total: number;
    }>(t.recorded.results[0]);

    // Development holds two repositories and leads; the three singletons follow
    // in the taxonomy's own order, with the dataset's 其他 before the
    // unclassified one — an answer before a blank.
    expect(data.sections.map((s) => s.key)).toEqual([
      "domain-development",
      "domain-testing",
      "domain-other",
      "domain-unclassified",
    ]);
    // The tied repository joins development, and each section keeps the browse
    // order (stars first).
    expect(data.sections[0].repos.map((r) => r.title)).toEqual([
      "o/mixed",
      "o/dev",
    ]);
    // A repository whose skills all say 其他 is not the same as one nothing
    // classified: each keeps its own section, and so its own chip.
    expect(data.sections[2].repos.map((r) => r.title)).toEqual(["o/other"]);
    expect(data.sections[3].repos.map((r) => r.title)).toEqual(["o/none"]);
    // Every repository appears exactly once.
    expect(data.total).toBe(5);
    expect(data.sections.flatMap((s) => s.repos)).toHaveLength(5);
  });

  it("breaks a tied leading vote by installs, then by taxonomy order", async () => {
    const t = setup({
      skills: [
        // The heavier lead wins the tie.
        classified(0, "o/heavy", ["testing"], { downloads: 40 }),
        classified(1, "o/heavy", ["development"], { downloads: 10 }),
        // Dead even: the taxonomy's own order settles it — development first.
        classified(2, "o/even", ["testing"], { downloads: 20 }),
        classified(3, "o/even", ["development"], { downloads: 20 }),
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getRepoSections", id: 1 });
    const data = resultData<{
      sections: Array<{ key: string; repos: Array<{ title: string }> }>;
    }>(t.recorded.results[0]);

    const domainOf = new Map(
      data.sections.flatMap((s) =>
        s.repos.map((r) => [r.title, s.key] as const),
      ),
    );
    expect(domainOf.get("o/heavy")).toBe("domain-testing");
    expect(domainOf.get("o/even")).toBe("domain-development");
  });
});

describe("createRegistryController — lookup", () => {
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
