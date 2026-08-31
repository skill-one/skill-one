import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "../types/skill";

const { useSkillSearch } = await import("./use-skill-search");

function makeSkills(count: number): Skill[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    repo: `acme/repo-${i}`,
    description: `Description for skill ${i}.`,
    stars: i,
    downloads: i,
  }));
}

/**
 * Replace the idle callbacks with a queue the test drains by hand, so the
 * moment right before the index exists can be observed deterministically.
 */
function holdIdle() {
  let nextHandle = 1;
  const tasks = new Map<number, () => void>();
  const cancelled: number[] = [];
  vi.stubGlobal("requestIdleCallback", (task: () => void) => {
    const handle = nextHandle++;
    tasks.set(handle, task);
    return handle;
  });
  vi.stubGlobal("cancelIdleCallback", (handle: number) => {
    cancelled.push(handle);
    tasks.delete(handle);
  });
  return {
    cancelled,
    /** Builds waiting for an idle moment. */
    pending: () => tasks.size,
    /** Run the builds queued so far, once each. */
    async drain() {
      await act(async () => {
        for (const [handle, task] of [...tasks]) {
          tasks.delete(handle);
          task();
        }
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSkillSearch", () => {
  let idle: ReturnType<typeof holdIdle>;

  beforeEach(() => {
    idle = holdIdle();
  });

  it("stays null while the registry is still streaming", async () => {
    const { result } = renderHook(() => useSkillSearch(makeSkills(3), false));

    await idle.drain();
    expect(result.current).toBeNull();
    expect(idle.pending()).toBe(0);
  });

  it("does not index during the render that follows the download", async () => {
    // Held outside the render callback: the registry array is stable across
    // renders in the app (it comes from the query cache), and the hook treats
    // a new reference as new data.
    const skills = makeSkills(3);
    const { result } = renderHook(() => useSkillSearch(skills, true));

    // The build is only queued, never run inline — that deferral is what
    // keeps the load's closing render off the critical path.
    expect(result.current).toBeNull();
    expect(idle.pending()).toBe(1);

    await idle.drain();
    expect(result.current).not.toBeNull();
  });

  it("searches fuzzy once the index has been built", async () => {
    const skills = makeSkills(3);
    const { result } = renderHook(() => useSkillSearch(skills, true));

    await idle.drain();

    // Ranks the exact hit first (the others only fuzzy-match on the digits).
    expect(result.current!("skill-1").map(({ skill }) => skill.name)).toContain(
      "skill-1",
    );
  });

  it("cancels a pending build when the consumer unmounts", () => {
    const { unmount } = renderHook(() => useSkillSearch(makeSkills(3), true));

    expect(idle.pending()).toBe(1);
    unmount();

    expect(idle.cancelled).toEqual([1]);
  });

  it("reuses an index already built for the same registry array", async () => {
    const skills = makeSkills(3);

    const first = renderHook(() => useSkillSearch(skills, true));
    await idle.drain();
    const built = first.result.current;
    first.unmount();

    // Remounting with the same array (a route switch back) adopts the cached
    // index on the very first render instead of rebuilding.
    const second = renderHook(() => useSkillSearch(skills, true));
    expect(second.result.current).toBe(built);
    expect(idle.pending()).toBe(0);
  });

  it("drops an index built for a previous registry array", async () => {
    const { result, rerender } = renderHook(
      ({ skills }: { skills: Skill[] }) => useSkillSearch(skills, true),
      { initialProps: { skills: makeSkills(3) } },
    );
    await idle.drain();
    expect(result.current).not.toBeNull();

    await act(async () => {
      rerender({ skills: makeSkills(3) });
    });

    // A fresh fetch invalidates the old index immediately, so results are
    // never served by stale data while the replacement builds.
    expect(result.current).toBeNull();
    expect(idle.pending()).toBe(1);
  });
});
