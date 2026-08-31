import { describe, it, expect, vi, afterEach } from "vitest";

import {
  DEFAULT_CDN_BASE,
  SourceFetchError,
  fileCandidates,
  fetchFirstStream,
  fetchFirstText,
  getCdnBase,
  setCdnBase,
} from "./cdn-config";

const ORIGIN =
  "https://raw.githubusercontent.com/anthropics/skills/HEAD/skills/pdf/SKILL.md";
const DEFAULT_CDN = `${DEFAULT_CDN_BASE}/gh/anthropics/skills/skills/pdf/SKILL.md`;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function ok() {
  return { ok: true, status: 200, text: async () => "body" } as Response;
}
function bad() {
  return { ok: false, status: 404 } as Response;
}

afterEach(() => {
  fetchMock.mockReset();
  setCdnBase("");
});

const spec = { repo: "anthropics/skills", path: "skills/pdf/SKILL.md" };

describe("fileCandidates", () => {
  it("prefers the GitHub origin, then the default CDN, when no CDN is set", () => {
    expect(fileCandidates(spec)).toEqual([ORIGIN, DEFAULT_CDN]);
  });

  it("prefers a configured CDN, then origin and the default CDN", () => {
    setCdnBase("https://cdn.example.com");
    expect(fileCandidates(spec)).toEqual([
      "https://cdn.example.com/gh/anthropics/skills/skills/pdf/SKILL.md",
      ORIGIN,
      DEFAULT_CDN,
    ]);
  });

  it("uses an explicit ref for both origin and CDN forms", () => {
    expect(
      fileCandidates({
        repo: "skill-one/skills-index",
        path: "index.jsonl",
        ref: "dist",
      }),
    ).toEqual([
      "https://raw.githubusercontent.com/skill-one/skills-index/dist/index.jsonl",
      `${DEFAULT_CDN_BASE}/gh/skill-one/skills-index@dist/index.jsonl`,
    ]);
  });
});

describe("getCdnBase / setCdnBase", () => {
  it("persists and reads the configured base", () => {
    expect(getCdnBase()).toBe("");
    setCdnBase("  https://cdn.example.com  ");
    expect(getCdnBase()).toBe("https://cdn.example.com");
  });
});

describe("fetchFirstText", () => {
  it("returns the first reachable candidate", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === ORIGIN ? ok() : bad(),
    );
    await expect(fetchFirstText([ORIGIN, DEFAULT_CDN])).resolves.toEqual({
      url: ORIGIN,
      text: "body",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next candidate when the first is unreachable", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === ORIGIN ? bad() : ok(),
    );
    const res = await fetchFirstText([ORIGIN, DEFAULT_CDN]);
    expect(res.url).toBe(DEFAULT_CDN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a typed http error when every candidate answers non-OK", async () => {
    fetchMock.mockResolvedValue(bad());
    const err = await fetchFirstText([ORIGIN, DEFAULT_CDN]).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/HTTP 404/);
  });

  it("throws a typed network error when a candidate never responds", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    const err = await fetchFirstText([ORIGIN, DEFAULT_CDN]).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("network");
    expect(err.status).toBeUndefined();
    expect(err.message).toMatch(/无法连接数据源/);
  });

  it("classifies a mixed failure (one 404, one network error) as network", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === ORIGIN ? bad() : Promise.reject(new TypeError("network down")),
    );
    const err = await fetchFirstText([ORIGIN, DEFAULT_CDN]).catch((e) => e);
    expect(err.kind).toBe("network");
  });

  it("passes an abort timeout signal to each request", async () => {
    fetchMock.mockResolvedValue(ok());
    await fetchFirstText([ORIGIN]);
    expect(fetchMock).toHaveBeenCalledWith(ORIGIN, {
      signal: expect.anything(),
    });
  });
});

describe("fetchFirstStream", () => {
  const encoder = new TextEncoder();

  /** A 200 response whose body streams out the given text chunks. */
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

  /** A 200 response whose body errors once `errorAfter` chunks were read. */
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

  /** Collect a streamed body into decoded text. */
  async function drain(body: ReadableStream<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return text;
  }

  it("streams the usable candidate's body to the consumer", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === ORIGIN ? streamOk(["hello ", "world"]) : bad(),
    );
    const consumed: string[] = [];
    await fetchFirstStream([ORIGIN, DEFAULT_CDN], async (body) => {
      consumed.push(await drain(body));
    });
    expect(consumed).toEqual(["hello world"]);
    // Both candidates are fetched: the race starts them in parallel even
    // though only the winner's body is consumed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lands on whichever candidate answers first and aborts the slower one", async () => {
    const signals = new Map<string, AbortSignal | null | undefined>();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      signals.set(url, init?.signal);
      if (url === ORIGIN) {
        // Headers never arrive on the origin: the mirror must win the race.
        return new Promise<Response>(() => {});
      }
      return streamOk(["whole"]);
    });
    const consumed: string[] = [];
    await fetchFirstStream([ORIGIN, DEFAULT_CDN], async (body) => {
      consumed.push(await drain(body));
    });
    expect(consumed).toEqual(["whole"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Losing the race aborts the stalled request instead of letting it hang
    // for its whole timeout.
    expect(signals.get(ORIGIN)?.aborted).toBe(true);
  });

  it("falls back to the next candidate when the stream fails mid-download", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === ORIGIN ? streamErrorAfter(["partial"], 1) : streamOk(["whole"]),
    );
    const consumed: string[] = [];
    await fetchFirstStream([ORIGIN, DEFAULT_CDN], async (body) => {
      consumed.push(await drain(body));
    });
    // The consumer restarts from scratch on the fallback candidate: one race
    // over both candidates, then one over the survivor.
    expect(consumed).toEqual(["whole"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws a typed http error when every candidate answers non-OK", async () => {
    fetchMock.mockResolvedValue(bad());
    const err = await fetchFirstStream([ORIGIN, DEFAULT_CDN], async () => {
      throw new Error("should not be called");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(404);
  });

  it("throws a typed network error when a candidate never responds", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    const err = await fetchFirstStream([ORIGIN, DEFAULT_CDN], async () => {
      throw new Error("should not be called");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceFetchError);
    expect(err.kind).toBe("network");
    expect(err.status).toBeUndefined();
  });

  it("passes an abort timeout signal to each request", async () => {
    fetchMock.mockResolvedValue(streamOk(["body"]));
    await fetchFirstStream([ORIGIN], async () => {});
    expect(fetchMock).toHaveBeenCalledWith(ORIGIN, {
      signal: expect.anything(),
    });
  });
});
