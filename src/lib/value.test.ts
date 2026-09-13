import { describe, it, expect } from "vitest";

import { count, record, text, textList } from "./value";

describe("text", () => {
  it("keeps a non-empty string and drops everything else", () => {
    expect(text("pdf")).toBe("pdf");
    expect(text("")).toBeUndefined();
    expect(text(42)).toBeUndefined();
    expect(text(null)).toBeUndefined();
  });
});

describe("textList", () => {
  it("keeps an array of non-empty strings only", () => {
    expect(textList(["a", "b"])).toEqual(["a", "b"]);
    expect(textList(["a", ""])).toBeUndefined();
    expect(textList(["a", 1])).toBeUndefined();
    expect(textList("a")).toBeUndefined();
  });
});

describe("count", () => {
  it("keeps a finite number only", () => {
    expect(count(12)).toBe(12);
    expect(count(Number.NaN)).toBeUndefined();
    expect(count(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(count("12")).toBeUndefined();
  });
});

describe("record", () => {
  it("narrows a plain object and rejects null and arrays", () => {
    expect(record<{ a: number }>({ a: 1 })).toEqual({ a: 1 });
    expect(record(null)).toBeNull();
    expect(record([1])).toBeNull();
    expect(record("x")).toBeNull();
  });
});
