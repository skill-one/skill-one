import { describe, expect, it } from "vitest";

import { estimateTokens } from "./token-estimate";

describe("estimateTokens", () => {
  it("estimates 0 for empty and whitespace-only text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("   \n\t ")).toBe(0);
  });

  it("counts each English word and punctuation mark as one token", () => {
    // 2 words + 1 comma + 1 period = 4
    expect(estimateTokens("Hammers, nails.")).toBe(4);
  });

  it("keeps in-word apostrophes and hyphens inside the word", () => {
    expect(estimateTokens("don't AI-created")).toBe(2);
  });

  it("treats repeated whitespace as free", () => {
    expect(estimateTokens("one  two\tthree\nfour")).toBe(4);
  });

  it("weights CJK characters at 0.75 tokens, rounded up", () => {
    // 4 chars * 0.75 = 3
    expect(estimateTokens("中文测试")).toBe(3);
    // 3 chars * 0.75 = 2.25 -> 3
    expect(estimateTokens("中文测")).toBe(3);
  });

  it("splits mixed English and Chinese without double-counting", () => {
    // 1 word + 2 CJK * 0.75 = 2.5 -> 3
    expect(estimateTokens("PDF 读取")).toBe(3);
  });

  it("counts standalone punctuation and symbols as tokens", () => {
    // 2 words + 1 slash
    expect(estimateTokens("read/write")).toBe(3);
    // 1 word + 3 dots
    expect(estimateTokens("wait...")).toBe(4);
  });

  it("stays within ~15% of exact o200k counts on realistic descriptions", () => {
    // Expected values are the estimator's own outputs, pinned so accidental
    // formula changes fail loudly. The comments give the exact o200k_base
    // count (js-tiktoken) the estimate lands near.
    const cases: Array<[string, number]> = [
      [
        // exact: 19
        "Use this skill when the user asks to create, edit, or review Word documents programmatically.",
        18,
      ],
      [
        // exact: 33
        "Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts.",
        29,
      ],
      ["PDF 文档读取、生成、合并、拆分与标注。", 15], // exact: 16
    ];
    for (const [text, expected] of cases) {
      expect(estimateTokens(text)).toBe(expected);
    }
  });
});
