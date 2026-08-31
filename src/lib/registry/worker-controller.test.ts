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
import type { RegistryCache } from "./cache";
import type {
  RegistryWorkerMessage,
  RepoSortOrder,
  ReposRequest,
} from "./protocol";
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

/** Unwrap a posted result, asserting it succeeded. */
function resultData<T>(message: ResultMessage): T {
  expect(message.ok).toBe(true);
  return (message as { data: unknown }).data as T;
}

interface Recorded {
  messages: RegistryWorkerMessage[];
  results: Array<Extract<RegistryWorkerMessage, { type: "result" }>>;
  progress: Array<Extract<RegistryWorkerMessage, { type: "progress" }>>;
  errors: Array<Extract<RegistryWorkerMessage, { type: "error" }>>;
  readyCount: number;
}

/** Drive the controller with an in-memory stream and cache. */
function setup(options?: {
  skills?: Skill[];
  cache?: RegistryCache;
  now?: () => number;
}) {
  const messages: RegistryWorkerMessage[] = [];
  const recorded: Recorded = {
    messages,
    results: [],
    progress: [],
    errors: [],
    readyCount: 0,
  };
  const post = (message: RegistryWorkerMessage) => {
    messages.push(message);
    if (message.type === "result") recorded.results.push(message);
    else if (message.type === "progress") recorded.progress.push(message);
    else if (message.type === "error") recorded.errors.push(message);
    else if (message.type === "ready") recorded.readyCount++;
  };

  let onLine: ((skill: Skill) => void) | null = null;
  const streams: Array<{
    resolve(): void;
    reject(err: unknown): void;
  }> = [];
  const readIndex = async (
    _cdnBase: string,
    line: (skill: Skill) => void,
  ): Promise<void> => {
    onLine = line;
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
      readIndex,
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
    /** Flush the async boot chain (cache read → stream start). */
    async flush() {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
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
    expect(t.controller.stats()).toEqual({
      count: 3,
      complete: true,
      indexing: false,
      ready: true,
    });
  });

  it("serves instantly from the cold-start cache, then revalidates", async () => {
    const cached = [skill(0), skill(1)];
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
    expect(t.controller.stats()).toEqual({
      count: 2,
      complete: true,
      indexing: false,
      ready: true,
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

  it("sorts by downloads and by name with per-version caching", async () => {
    const t = setup({
      skills: [skill(0), skill(1), skill(2)], // downloads 100, 99, 98
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getPage",
      id: 1,
      payload: { query: "", sort: "downloads", page: 0, pageSize: 3 },
    });
    const byDownloads = resultData<{ hits: Array<{ skill: Skill }> }>(
      t.recorded.results[0],
    );
    expect(byDownloads.hits.map((h) => h.skill.name)).toEqual([
      "skill-0",
      "skill-1",
      "skill-2",
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

  it("searches by substring while streaming and fuzzy once indexed", async () => {
    const t = setup();
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.push({ ...skill(0), name: "gadget-master", repo: "acme/gadgets" });
    t.push({ ...skill(1), name: "tool-a", repo: "acme/tools" });

    // Mid-stream: substring match over the loaded prefix only.
    t.controller.handle({
      type: "getPage",
      id: 1,
      payload: { query: "gadget", sort: "default", page: 0, pageSize: 5 },
    });
    const substring = resultData<{ total: number }>(t.recorded.results[0]);
    expect(substring.total).toBe(1);

    t.controller.handle({
      type: "getPage",
      id: 2,
      payload: { query: "gadgt", sort: "default", page: 0, pageSize: 5 },
    });
    const typoMidStream = resultData<{ total: number }>(t.recorded.results[1]);
    expect(typoMidStream.total).toBe(0);

    t.complete();
    await t.flush();

    // Indexed: the same typo fuzzy-matches.
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
        { ...skill(0), name: "alpha", repo: "acme/alpha", weeklyInstalls: 500 },
        { ...skill(1), name: "beta", repo: "acme/beta", weeklyInstalls: 100 },
      ],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({ type: "getFeatured", id: 1 });
    const data = resultData<{
      slides: Array<{ id: string; entries: Array<{ skill: Skill }> }>;
      sections: Array<{ skills: Array<{ index: number }> }>;
    }>(t.recorded.results[0]);
    // The weekly board exists and ranks alpha above beta by weekly installs.
    const weekly = data.slides.find((s) => s.id === "weekly");
    expect(weekly?.entries.map((e) => e.skill.name)).toEqual(["alpha", "beta"]);
    // Curated sections number their cards globally for the detail panel.
    const indexes = data.sections.flatMap((s) => s.skills.map((x) => x.index));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(indexes[0]).toBe(0);
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
});

describe("createRegistryController — getRanking", () => {
  /** Boot a complete registry of `n` ranked skills (skill-0 leads). */
  async function boot(n: number) {
    const t = setup({
      skills: Array.from({ length: n }, (_, i) =>
        skill(i, { downloads: (n - i) * 1_000, weeklyInstalls: n - i }),
      ),
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();
    return t;
  }


  it("returns the leaderboard ranked, truncated and counted", async () => {
    const t = await boot(150);

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "weekly" },
    });
    const data = resultData<{
      id: string;
      entries: Array<{ rank: number; skill: Skill; label: string }>;
      total: number;
    }>(t.recorded.results[0]);

    expect(data.id).toBe("weekly");
    // Truncated to the page size, but counted in full.
    expect(data.entries).toHaveLength(100);
    expect(data.total).toBe(150);
    expect(data.entries[0]).toMatchObject({ rank: 1, label: "150/周" });
    expect(data.entries[0].skill.name).toBe("skill-0");
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
    // Nothing clears the lifetime floor, so the rising board has no entries.
    const t = setup({
      skills: [skill(0, { downloads: 0, weeklyInstalls: 0 })],
    });
    t.controller.init({ cdnBase: "test" });
    await t.flush();

    t.controller.handle({
      type: "getRanking",
      id: 1,
      payload: { rankingId: "rising" },
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
  // Four skills across three repos: alpha has 2 skills (80 downloads,
  // 10 stars), beta 1 skill (100 downloads, 5 stars), git/x 1 skill.
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


  function requestRepos(
    t: ReturnType<typeof setup>,
    payload: ReposRequest,
  ) {
    const before = t.recorded.results.length;
    t.controller.handle({ type: "getRepos", id: before + 1, payload });
    return resultData<{ repos: Array<{ repo: string }>; total: number }>(
      t.recorded.results[before],
    );
  }

  it("aggregates per-repo skill counts, downloads and stars", async () => {
    const t = await reposSetup(reposSkills);
    const data = requestRepos(t, {
      query: "",
      sort: "default",
      page: 0,
      pageSize: 10,
    });
    expect(data.total).toBe(3);
    // Default order: most skills first, repo name as the tie-break.
    expect(data.repos).toEqual([
      { repo: "acme/alpha", skills: 2, downloads: 80, stars: 10 },
      { repo: "acme/beta", skills: 1, downloads: 100, stars: 5 },
      { repo: "git/x", skills: 1, downloads: 1, stars: 1 },
    ]);
  });

  it("filters by case-insensitive repo substring", async () => {
    const t = await reposSetup(reposSkills);
    expect(
      requestRepos(t, {
        query: "ACME",
        sort: "default",
        page: 0,
        pageSize: 10,
      }).total,
    ).toBe(2);
    expect(
      requestRepos(t, {
        query: "beta",
        sort: "default",
        page: 0,
        pageSize: 10,
      }).repos[0]?.repo,
    ).toBe("acme/beta");
  });

  it("sorts by skills, downloads and name", async () => {
    const t = await reposSetup(reposSkills);
    const names = (sort: RepoSortOrder) =>
      requestRepos(t, { query: "", sort, page: 0, pageSize: 10 }).repos.map(
        (r) => r.repo,
      );
    expect(names("skills")).toEqual(["acme/alpha", "acme/beta", "git/x"]);
    expect(names("downloads")).toEqual(["acme/beta", "acme/alpha", "git/x"]);
    expect(names("name")).toEqual(["acme/alpha", "acme/beta", "git/x"]);
  });

  it("pages the repo list", async () => {
    const t = await reposSetup(reposSkills);
    const page0 = requestRepos(t, {
      query: "",
      sort: "default",
      page: 0,
      pageSize: 2,
    });
    const page1 = requestRepos(t, {
      query: "",
      sort: "default",
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
      requestRepos(t, { query: "", sort: "default", page: 0, pageSize: 10 })
        .total,
    ).toBe(1);
    t.push(reposSkills[2]);
    expect(
      requestRepos(t, { query: "", sort: "default", page: 0, pageSize: 10 })
        .total,
    ).toBe(2);

    t.complete();
    await t.flush();

    // Landed: the settled aggregation answers from the per-version cache.
    expect(
      requestRepos(t, { query: "", sort: "default", page: 0, pageSize: 10 }),
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
    expect(t.controller.stats()).toEqual({
      count: 0,
      complete: false,
      indexing: false,
      ready: false,
    });
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
