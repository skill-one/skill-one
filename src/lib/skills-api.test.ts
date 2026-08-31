import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import mockPagesData from "../data/skills-mock.json";

const INDEX_URL =
  "https://raw.githubusercontent.com/skill-one/skills-index/dist/index.jsonl";

const mockPages = mockPagesData as Array<{
  skills: {
    skillId: string;
    source: string;
    name: string;
    installs: number;
    weeklyInstalls: number[];
    description?: string;
    stars?: number;
  }[];
}>;

const fetchMock = vi.fn();

const encoder = new TextEncoder();

/**
 * A successful response whose body streams out the given text chunks, one
 * chunk per read — the JSONL index arrives exactly like this over the wire.
 */
function streamOk(chunks: string[]): Response {
  let sent = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[sent++]));
      },
    }),
  );
}

/** Like `streamOk`, but the body errors once `errorAfter` chunks were read. */
function streamErrorAfter(chunks: string[], errorAfter: number): Response {
  let sent = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= errorAfter) {
          controller.error(new Error("connection dropped"));
          return;
        }
        controller.enqueue(encoder.encode(chunks[sent++]));
      },
    }),
  );
}

/**
 * A body that delivers one chunk every `intervalMs` of fake time, so the
 * throttled progress notifications can be observed deterministically.
 */
function timedStream(chunks: string[], intervalMs: number): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (i: number) => {
        try {
          if (i >= chunks.length) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(chunks[i]));
        } catch {
          // The stream was cancelled (a lost race): stop producing.
          return;
        }
        setTimeout(() => push(i + 1), intervalMs);
      };
      push(0);
    },
  });
  return new Response(body);
}

/**
 * Like `timedStream`, but the body errors once `errorAfter` chunks were read —
 * a candidate that dies part-way through, with the timing needed to observe
 * the progress notifications it already emitted.
 */
function timedStreamError(
  chunks: string[],
  intervalMs: number,
  errorAfter: number,
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (i: number) => {
        try {
          if (i >= errorAfter) {
            controller.error(new Error("connection dropped"));
            return;
          }
          controller.enqueue(encoder.encode(chunks[i]));
        } catch {
          // The stream was cancelled (a lost race): stop producing.
          return;
        }
        setTimeout(() => push(i + 1), intervalMs);
      };
      push(0);
    },
  });
  return new Response(body);
}

/** A single-chunk text response, as most tests need. */
function ok(body: string): Response {
  return streamOk([body]);
}

/** JSONL text built from index entries (one JSON object per line). */
function jsonl(...entries: unknown[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}

/**
 * Serve a fresh OK stream of `body` to every candidate request. The download
 * races its candidates in parallel, so each needs its own Response — a body
 * can only be consumed once, and the race discards the loser's.
 */
function mockIndexBody(body: string) {
  fetchMock.mockImplementation(async () => ok(body));
}

/** Fresh module import so the index cache does not leak between tests. */
async function freshModule() {
  vi.resetModules();
  return import("./skills-api");
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchSkillsPage", () => {
  it("downloads the index from JSDMirror and maps raw fields onto the Skill model", async () => {
    const { fetchSkillsPage } = await freshModule();
    mockIndexBody(
      jsonl({
        source: "vercel-labs/skills",
        skillId: "find-skills",
        installs: 2991984,
        weeklyInstalls: [113781],
        stars: 29975,
        description: "helps you find skills",
        path: "skills/find-skills",
      }),
    );

    const skill = (await fetchSkillsPage(0)).skills[0];

    // One load = one race: every candidate is requested in parallel, and the
    // winner's body is consumed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(INDEX_URL, {
      signal: expect.anything(),
    });
    expect(skill).toEqual({
      name: "find-skills",
      repo: "vercel-labs/skills",
      description: "helps you find skills",
      stars: 29975,
      downloads: 2991984,
      weeklyInstalls: 113781,
      path: "skills/find-skills",
    });
  });

  it("keeps the most recent week of the weekly install series", async () => {
    const { fetchSkillsPage } = await freshModule();
    // The series is chronological, so the last entry is the current week; an
    // entry without weekly data surfaces as undefined rather than 0 so the
    // rankings can tell "no data" and "zero installs" apart. Live index lines
    // exists both with an empty series and without the field at all.
    mockIndexBody(
      jsonl(
        {
          source: "owner/repo",
          skillId: "trending",
          installs: 100,
          weeklyInstalls: [30, 20, 50],
        },
        {
          source: "owner/repo",
          skillId: "no-weekly",
          installs: 5,
          weeklyInstalls: [],
        },
        {
          source: "owner/repo",
          skillId: "field-missing",
          installs: 7,
        },
      ),
    );

    const page = await fetchSkillsPage(0);

    expect(page.skills[0].weeklyInstalls).toBe(50);
    expect(page.skills[1].weeklyInstalls).toBeUndefined();
    expect(page.skills[2].weeklyInstalls).toBeUndefined();
  });

  it("normalizes missing stars/installs to 0", async () => {
    const { fetchSkillsPage } = await freshModule();
    // Old snapshot entries carry installs but no stars; sparse index entries
    // may lack installs. Both must surface as 0, not undefined.
    mockIndexBody(
      jsonl(
        {
          source: "vercel-labs/skills",
          skillId: "snapshot-entry",
          installs: 42,
          weeklyInstalls: [],
        },
        {
          source: "owner/repo",
          skillId: "sparse-entry",
          weeklyInstalls: [],
          stars: 7,
        },
      ),
    );

    const page = await fetchSkillsPage(0);

    expect(page.skills).toEqual([
      {
        name: "snapshot-entry",
        repo: "vercel-labs/skills",
        description: "",
        stars: 0,
        downloads: 42,
        path: undefined,
      },
      {
        name: "sparse-entry",
        repo: "owner/repo",
        description: "",
        stars: 7,
        downloads: 0,
        path: undefined,
      },
    ]);
  });

  it("filters out non-GitHub sources, skips malformed lines and defaults missing descriptions", async () => {
    const { fetchSkillsPage } = await freshModule();
    mockIndexBody(
      [
        JSON.stringify({
          source: "vercel-labs/skills",
          skillId: "find-skills",
          installs: 1,
          weeklyInstalls: [],
        }),
        JSON.stringify({
          source: "open.feishu.cn",
          skillId: "feishu",
          installs: 10,
          weeklyInstalls: [],
        }),
        "this is not json",
        "",
        JSON.stringify({
          source: "owner/repo",
          skillId: "no-desc",
          installs: 2,
          weeklyInstalls: [],
        }),
      ].join("\n"),
    );

    const page = await fetchSkillsPage(0);

    expect(page.skills).toHaveLength(2);
    expect(page.skills[0].repo).toBe("vercel-labs/skills");
    expect(page.skills[1].description).toBe("");
    expect(page.total).toBe(2);
  });

  it("slices pages of 200, reports hasMore/total and downloads the index only once", async () => {
    const { fetchSkillsPage } = await freshModule();
    // 200 snapshot entries plus one extra line → page 0 full, one more page.
    const entries: unknown[] = [
      ...mockPages[0].skills,
      {
        source: "owner/repo",
        skillId: "extra",
        installs: 1,
        weeklyInstalls: [],
      },
    ];
    mockIndexBody(jsonl(...entries));

    const page0 = await fetchSkillsPage(0);
    expect(page0.skills).toHaveLength(200);
    expect(page0.skills[0].name).toBe(mockPages[0].skills[0].name);
    expect(page0.hasMore).toBe(true);
    expect(page0.total).toBe(201);

    const page1 = await fetchSkillsPage(1);
    expect(page1.skills).toHaveLength(1);
    expect(page1.skills[0].name).toBe("extra");
    expect(page1.hasMore).toBe(false);

    // The full index is cached and shared across pagination requests: the
    // second call requests nothing new (2 = the initial race's candidates).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty page past the end", async () => {
    const { fetchSkillsPage } = await freshModule();
    mockIndexBody(jsonl(...mockPages[0].skills));

    const past = await fetchSkillsPage(1);

    expect(past.skills).toEqual([]);
    expect(past.hasMore).toBe(false);
    expect(past.total).toBe(200);
  });

  it("falls back to the CDN and clears the cache on total failure, retrying next call", async () => {
    const { fetchSkillsPage } = await freshModule();
    // Both candidates fail on the first attempt → loadIndex rejects.
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      // Second attempt (cache cleared) succeeds, whichever candidate wins.
      .mockImplementation(async () =>
        ok(
          jsonl({
            source: "owner/repo",
            skillId: "pdf",
            installs: 1,
            weeklyInstalls: [],
          }),
        ),
      );
    await expect(fetchSkillsPage(0)).rejects.toThrow();

    await expect(fetchSkillsPage(0)).resolves.toBeDefined();
    // Two raced candidates per attempt.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects when every candidate is a non-2xx response", async () => {
    const { fetchSkillsPage } = await freshModule();
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(fetchSkillsPage(0)).rejects.toThrow(/HTTP 404/);
  });
});

describe("index streaming", () => {
  it("parses lines split across chunk boundaries and the final unterminated line", async () => {
    const { fetchFullIndex } = await freshModule();
    const line = (name: string) =>
      JSON.stringify({
        source: "owner/repo",
        skillId: name,
        installs: 1,
        weeklyInstalls: [],
      });
    // Chunk 1 ends mid-line (the beta object is cut in half); chunk 2
    // completes it; the last line arrives without a trailing newline.
    const beta = line("beta");
    const mid = Math.floor(beta.length / 2);
    fetchMock.mockImplementation(async () =>
      streamOk([
        `${line("alpha")}\n${beta.slice(0, mid)}`,
        `${beta.slice(mid)}\n${line("gamma")}`,
      ]),
    );

    const skills = await fetchFullIndex();

    expect(skills.map((s) => s.name)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("reports cumulative progress snapshots to subscribers while streaming", async () => {
    vi.useFakeTimers();
    const { fetchFullIndex, subscribeIndexProgress } = await freshModule();
    const line = (name: string) =>
      JSON.stringify({
        source: "owner/repo",
        skillId: name,
        installs: 1,
        weeklyInstalls: [],
      });
    // One chunk per 450ms — beyond the 400ms throttle interval, so every
    // chunk produces exactly one notification. The losing candidate's
    // identical stream is never consumed.
    fetchMock.mockImplementation(async () =>
      timedStream([`${line("a")}\n`, `${line("b")}\n`, `${line("c")}\n`], 450),
    );

    const listener = vi.fn();
    const unsubscribe = subscribeIndexProgress(listener);
    const done = fetchFullIndex();

    await vi.advanceTimersByTimeAsync(50);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(450);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(450);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2][0]).toHaveLength(3);

    // Snapshots are cumulative and ordered; the stream closes one interval
    // after the final chunk and the promise settles with the full list.
    expect(
      listener.mock.calls[2][0].map((s: { name: string }) => s.name),
    ).toEqual(["a", "b", "c"]);
    await vi.advanceTimersByTimeAsync(450);
    await expect(done).resolves.toHaveLength(3);
    unsubscribe();
  });

  it("gives a late subscriber an immediate snapshot of what has loaded so far", async () => {
    vi.useFakeTimers();
    const { fetchFullIndex, subscribeIndexProgress } = await freshModule();
    const line = (name: string) =>
      JSON.stringify({
        source: "owner/repo",
        skillId: name,
        installs: 1,
        weeklyInstalls: [],
      });
    fetchMock.mockImplementation(async () =>
      timedStream([`${line("a")}\n`, `${line("b")}\n`, `${line("c")}\n`], 450),
    );

    const done = fetchFullIndex();
    await vi.advanceTimersByTimeAsync(500); // two chunks parsed

    // A page mounting mid-download paints from the current snapshot right
    // away, then keeps receiving throttled updates.
    const lateListener = vi.fn();
    const unsubscribe = subscribeIndexProgress(lateListener);
    expect(lateListener).toHaveBeenCalledTimes(1);
    expect(lateListener.mock.calls[0][0]).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(500);
    expect(lateListener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(450);
    await expect(done).resolves.toHaveLength(3);
  });

  it("falls back to the next candidate when the stream fails mid-download", async () => {
    const { fetchFullIndex } = await freshModule();
    const line = (name: string) =>
      JSON.stringify({
        source: "owner/repo",
        skillId: name,
        installs: 1,
        weeklyInstalls: [],
      });
    // The origin dies after one chunk; the CDN serves the whole file.
    fetchMock.mockImplementation(async (url: string) =>
      url === INDEX_URL
        ? streamErrorAfter([`${line("a")}\n`], 1)
        : ok(`${line("b")}\n${line("c")}`),
    );

    const skills = await fetchFullIndex();

    // Two raced candidates, then the survivor alone after the fallback.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(skills.map((s) => s.name)).toEqual(["b", "c"]);
  });

  it("never rewinds the cumulative progress when a candidate restarts", async () => {
    vi.useFakeTimers();
    const { fetchFullIndex, subscribeIndexProgress } = await freshModule();
    const line = (name: string) =>
      JSON.stringify({
        source: "owner/repo",
        skillId: name,
        installs: 1,
        weeklyInstalls: [],
      });
    // The origin serves a, b, c (one notification each at 450ms) and dies;
    // the CDN then re-serves the file from scratch, so its early snapshots
    // are shorter than the three entries listeners have already seen.
    fetchMock.mockImplementation(async (url: string) =>
      url === INDEX_URL
        ? timedStreamError(
            [`${line("a")}\n`, `${line("b")}\n`, `${line("c")}\n`],
            450,
            3,
          )
        : timedStream(
            [
              `${line("b")}\n`,
              `${line("c")}\n`,
              `${line("d")}\n`,
              `${line("e")}\n`,
            ],
            450,
          ),
    );

    const seen: number[] = [];
    const unsubscribe = subscribeIndexProgress((skills) => {
      seen.push(skills.length);
    });
    const done = fetchFullIndex();

    // Run both candidates to completion.
    for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(450);
    await done;

    // The restart's shorter snapshots are dropped, so the count the UI shows
    // only ever climbs: 1, 2, 3, then 4 once the retry passes the point the
    // first candidate had reached. It never jumps back down to 1.
    expect(seen).toEqual([1, 2, 3, 4]);
    unsubscribe();
  });

  it("starts the download from a progress subscription alone", async () => {
    const { subscribeIndexProgress } = await freshModule();
    mockIndexBody(
      jsonl({
        source: "owner/repo",
        skillId: "solo",
        installs: 1,
        weeklyInstalls: [],
      }),
    );

    const listener = vi.fn();
    const unsubscribe = subscribeIndexProgress(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    // One load = one race over both candidates.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
