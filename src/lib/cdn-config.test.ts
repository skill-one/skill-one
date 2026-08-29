import { describe, it, expect, vi, afterEach } from "vitest";

import {
  DEFAULT_CDN_BASE,
  SourceFetchError,
  fileCandidates,
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
