import { describe, expect, it } from "vitest";

import en from "./en.json";
import zh from "./zh.json";

/** All leaf keys of a translation resource, as dot-joined paths. */
function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Every leaf value of a translation resource, paired with its key. */
function leafEntries(
  value: unknown,
  prefix = "",
): Array<[string, unknown]> {
  if (typeof value !== "object" || value === null) {
    return [[prefix, value]];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) =>
      leafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale resources", () => {
  it("ships the same key structure in English and Chinese", () => {
    expect(leafKeys(zh).toSorted()).toEqual(leafKeys(en).toSorted());
  });

  it("has no empty or whitespace-only translation", () => {
    for (const [key, value] of [...leafEntries(en), ...leafEntries(zh)]) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it("keeps interpolation placeholders aligned across locales", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{\s*(\w+)/g)].map((match) => match[1]).toSorted();
    for (const key of leafKeys(en)) {
      const enText = key
        .split(".")
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown>)[segment],
          en,
        ) as string;
      const zhText = key
        .split(".")
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown>)[segment],
          zh,
        ) as string;
      expect(placeholders(zhText), key).toEqual(placeholders(enText));
    }
  });
});
