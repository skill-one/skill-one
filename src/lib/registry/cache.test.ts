import { describe, expect, it } from "vitest";

import { createRegistryCache } from "./cache";
import type { KeyValueStore } from "./cache";
import type { Skill } from "../../types/skill";

const skills: Skill[] = [
  { name: "a", repo: "o/a", description: "", stars: 1, downloads: 2 },
  { name: "b", repo: "o/b", description: "", stars: 3, downloads: 4 },
];

/**
 * In-memory stand-in for the key/value layer, with switches to make every
 * operation reject (a blocked database) or only reads reject.
 */
function fakeStore(reject: "all" | "get" | "none" = "none") {
  const data = new Map<string, unknown>();
  const down = () => Promise.reject(new Error("blocked"));
  const blocked = reject === "all";
  return {
    data,
    get: <T>(key: string) =>
      blocked || reject === "get"
        ? down()
        : Promise.resolve(data.get(key) as T | undefined),
    set: (key: string, value: unknown) =>
      blocked ? down() : (data.set(key, value), Promise.resolve()),
    del: (key: string) =>
      blocked ? down() : (data.delete(key), Promise.resolve()),
  } satisfies KeyValueStore & { data: Map<string, unknown> };
}

describe("createRegistryCache", () => {
  it("round-trips the parsed registry and its identity through save/load", async () => {
    const cache = createRegistryCache(fakeStore());

    await cache.save(skills, {
      tag: "dist-2026-09-01",
      
      generatedAt: "2026-09-01T14:25:32Z",
    });
    const loaded = await cache.load();
    expect(loaded?.skills).toEqual(skills);
    expect(loaded).toMatchObject({
      tag: "dist-2026-09-01",
      
      generatedAt: "2026-09-01T14:25:32Z",
    });
    // When the record was written is kept for display, never for comparison.
    expect(loaded?.fetchedAt).toBeGreaterThan(0);
  });

  it("loads a record saved without an identity as an unknown tag", async () => {
    const cache = createRegistryCache(fakeStore());

    await cache.save(skills);
    // A record from before run addressing (or from a run that could not
    // reach any meta): usable data, but nothing to compare a probe against.
    await expect(cache.load()).resolves.toMatchObject({
      skills,
      tag: undefined,
    });
  });

  it("returns null on an empty store", async () => {
    await expect(createRegistryCache(fakeStore()).load()).resolves.toBeNull();
  });

  it("drops records written by an older schema version", async () => {
    const store = fakeStore();
    const cache = createRegistryCache(store);
    await cache.save(skills, { tag: "dist-2026-09-01" });

    // Age the stored record into a previous schema version.
    const record = [...store.data.values()][0] as { schemaVersion: number };
    record.schemaVersion = -1;
    await expect(cache.load()).resolves.toBeNull();
  });

  it("clear() removes the stored record", async () => {
    const cache = createRegistryCache(fakeStore());
    await cache.save(skills, { tag: "dist-2026-09-01" });
    await cache.clear();
    await expect(cache.load()).resolves.toBeNull();
  });

  it("degrades to null / no-ops when the database is unreachable", async () => {
    const cache = createRegistryCache(fakeStore("all"));
    await expect(cache.load()).resolves.toBeNull();
    await expect(
      cache.save(skills, { tag: "dist-2026-09-01" }),
    ).resolves.toBeUndefined();
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it("degrades to null when a read fails", async () => {
    await expect(
      createRegistryCache(fakeStore("get")).load(),
    ).resolves.toBeNull();
  });
});
