import { describe, expect, it } from "vitest";

import { buildSearchIndex, tokenize } from "./search-index";

interface Doc {
  name: string;
  description?: string;
}

const docs: Doc[] = [
  { name: "pdf-exporter", description: "Extract text from PDF files." },
  { name: "redis-cache-helper", description: "Keeps the cache warm." },
  { name: "jsdemo", description: "A JavaScript playground." },
  { name: "commit-writer", description: "生成符合规范的中文提交信息。" },
];

const search = buildSearchIndex<Doc>(docs, {
  fields: { name: 4, description: 1 },
});

const names = (query: string) => search(query).map(({ doc }) => doc.name);

describe("tokenize", () => {
  it("splits Latin words on whitespace and punctuation", () => {
    expect(tokenize("pdf-exporter  Redis")).toEqual([
      "pdf",
      "exporter",
      "Redis",
    ]);
  });

  it("expands a Han run into single characters and bigrams", () => {
    expect(tokenize("中文提")).toEqual(["中", "文", "提", "中文", "文提"]);
  });

  it("keeps a lone Han character as one term", () => {
    expect(tokenize("提")).toEqual(["提"]);
  });

  it("splits mixed-script text at the script boundary", () => {
    expect(tokenize("pdf中文")).toEqual(["pdf", "中", "文", "中文"]);
  });
});

describe("buildSearchIndex", () => {
  it("matches a term exactly, ignoring case", () => {
    expect(names("REDIS")).toEqual(["redis-cache-helper"]);
  });

  it("matches a term prefix, so a half-typed word still answers", () => {
    expect(names("pdf-exp")).toEqual(["pdf-exporter"]);
  });

  it("does not match inside a word", () => {
    // "demo" and "script" sit inside the terms "jsdemo" and "JavaScript", but
    // do not start them — a mid-word fragment is not a match, unlike the old
    // substring filter.
    expect(names("demo")).toEqual([]);
    expect(names("script")).toEqual([]);
  });

  it("does not forgive a typo", () => {
    // Single-term queries, so the OR fallback cannot rescue a mistyped word
    // out of the other terms in the same query.
    expect(names("exporet")).toEqual([]);
    expect(names("helpr")).toEqual([]);
  });

  it("requires every term to match, falling back to any term only when none does", () => {
    // Both terms present: only the document carrying both is returned.
    expect(names("cache warm")).toEqual(["redis-cache-helper"]);
    // One term matches nothing at all: AND is empty, so OR keeps the list from
    // blanking instead of reporting no result.
    expect(names("cache kubernetes")).toEqual(["redis-cache-helper"]);
  });

  it("keeps CJK adjacency significant across documents", () => {
    const cjk = buildSearchIndex<Doc>(
      [
        { name: "one", description: "中文提交" },
        { name: "two", description: "文中对提" },
      ],
      { fields: { description: 1 } },
    );
    // Both documents contain 中 and 文, but only the first has them adjacent,
    // so the bigram query matches one document.
    expect(
      cjk("中文").map(({ doc }) => doc.description),
    ).toEqual(["中文提交"]);
  });

  it("matches a single CJK character", () => {
    expect(names("提")).toEqual(["commit-writer"]);
  });

  it("indexes documents whose optional field is missing", () => {
    const sparse = buildSearchIndex<Doc>([{ name: "solo" }], {
      fields: { name: 1, description: 1 },
    });
    expect(sparse("solo").map(({ doc }) => doc.name)).toEqual(["solo"]);
  });

  it("reports the matched terms per field for highlighting", () => {
    const [hit] = search("redis");
    expect(hit.matched).toEqual({ name: ["redis"] });
  });

  it("puts the stronger field first when both match the same term", () => {
    const ranked = buildSearchIndex<Doc>(
      [
        { name: "helper", description: "Mentions redis here." },
        { name: "redis-helper", description: "Unrelated." },
      ],
      { fields: { name: 4, description: 1 } },
    );
    expect(
      ranked("redis").map(({ doc }) => doc.name),
    ).toEqual(["redis-helper", "helper"]);
  });

  it("applies a per-document boost over the relevance score", () => {
    const boosted = buildSearchIndex<Doc>(
      [
        { name: "redis-alpha" },
        { name: "redis-beta" },
      ],
      {
        fields: { name: 1 },
        boostDocument: ({ name }) => (name === "redis-beta" ? 10 : 1),
      },
    );
    expect(
      boosted("redis").map(({ doc }) => doc.name),
    ).toEqual(["redis-beta", "redis-alpha"]);
  });

  it("returns nothing for an empty query", () => {
    expect(search("")).toEqual([]);
  });
});
