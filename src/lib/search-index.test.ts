import { describe, expect, it } from "vitest";

import { buildSearchIndex } from "./search-index";

interface Doc {
  name: string;
  description?: string;
}

const docs: Doc[] = [
  { name: "pdf-exporter", description: "Extract text from PDF files." },
  { name: "redis-cache-helper", description: "Keeps the cache warm." },
  { name: "jsdemo", description: "A JavaScript playground." },
];

const search = buildSearchIndex<Doc>(docs);

const names = (query: string) => search(query).map(({ doc }) => doc.name);

describe("buildSearchIndex", () => {
  it("matches a name term exactly, ignoring case", () => {
    expect(names("REDIS")).toEqual(["redis-cache-helper"]);
  });

  it("splits on punctuation, so a spaced query matches a hyphenated name", () => {
    expect(names("pdf exporter")).toEqual(["pdf-exporter"]);
  });

  it("matches a term prefix, so a half-typed word still answers", () => {
    expect(names("pdf-exp")).toEqual(["pdf-exporter"]);
  });

  it("does not match inside a word", () => {
    // "demo" sits inside the term "jsdemo" without starting it — a mid-word
    // fragment is not a match, unlike the old substring filter.
    expect(names("demo")).toEqual([]);
  });

  it("does not forgive a typo", () => {
    expect(names("exporet")).toEqual([]);
    expect(names("helpr")).toEqual([]);
  });

  it("requires every term to match", () => {
    // Both terms are in the name, so only that document comes back.
    expect(names("redis cache")).toEqual(["redis-cache-helper"]);
    // One term matches nothing at all, so the whole query is empty — there is
    // no OR fallback that would widen it back to the unrelated hits.
    expect(names("redis kubernetes")).toEqual([]);
  });

  it("never searches the description", () => {
    // "warm" and "playground" are description words only.
    expect(names("warm")).toEqual([]);
    expect(names("playground")).toEqual([]);
  });

  it("reports the matched name terms for highlighting", () => {
    const [hit] = search("redis");
    expect(hit.matched).toEqual({ name: ["redis"] });
  });

  it("indexes documents whose optional field is missing", () => {
    const sparse = buildSearchIndex<Doc>([{ name: "solo" }]);
    expect(sparse("solo").map(({ doc }) => doc.name)).toEqual(["solo"]);
  });

  it("returns nothing for an empty query", () => {
    expect(search("")).toEqual([]);
  });
});
