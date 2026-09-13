import { describe, it, expect } from "vitest";

import {
  descriptionSimilarity,
  tokenizeDescription,
} from "./description-similarity";

describe("tokenizeDescription", () => {
  it("lowercases and splits on punctuation", () => {
    expect(tokenizeDescription("Build, Tiny-Gadgets!")).toEqual([
      "build",
      "tiny",
      "gadgets",
    ]);
  });

  it("explodes Han segments into character bigrams", () => {
    expect(tokenizeDescription("读取PDF文件")).toEqual([
      "读取",
      "pdf",
      "文件",
    ]);
    expect(tokenizeDescription("代码审查工具")).toEqual([
      "代码",
      "码审",
      "审查",
      "查工",
      "工具",
    ]);
  });

  it("keeps a single Han character as its own token", () => {
    expect(tokenizeDescription("码")).toEqual(["码"]);
  });

  it("yields no tokens for punctuation-only text", () => {
    expect(tokenizeDescription("--- ... !!!")).toEqual([]);
  });
});

describe("descriptionSimilarity", () => {
  it("is 1 for identical descriptions", () => {
    const d = "PDF 文档读取、生成、合并、拆分与标注。";
    expect(descriptionSimilarity(d, d)).toBe(1);
  });

  it("is 0 when either side has no tokens", () => {
    expect(descriptionSimilarity("", "read files")).toBe(0);
    expect(descriptionSimilarity("read files", "")).toBe(0);
  });

  it("is 0 for disjoint descriptions", () => {
    expect(
      descriptionSimilarity("build tiny gadgets", "cook italian pasta"),
    ).toBe(0);
  });

  it("scores partial overlap between 0 and 1", () => {
    const score = descriptionSimilarity(
      "Read PDF files and merge them",
      "Read PDF files and split them",
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("is symmetric", () => {
    const a = "运行结构化代码审查，包含严重级别和建议。";
    const b = "结构化代码审查工具，给出严重级别。";
    expect(descriptionSimilarity(a, b)).toBe(descriptionSimilarity(b, a));
  });
});
