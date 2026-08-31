import { useEffect, useState } from "react";

import { scheduleIdle } from "../lib/idle-schedule";
import {
  createSkillSearch,
  peekSkillSearch,
  type SkillSearch,
} from "../lib/search-skills";
import type { Skill } from "../types/skill";

/**
 * Fuzzy search over the registry, built once the download has completed —
 * `null` until it is ready.
 *
 * Indexing the whole registry costs hundreds of milliseconds. Doing it during
 * the render that follows the download would stall that render, so the build
 * is deferred to the first idle moment instead: the page paints the finished
 * list first, and the index lands a moment later. Callers fall back to
 * substring matching until then. The result is cached per registry array, so
 * revisiting the page reuses it instead of rebuilding.
 */
export function useSkillSearch(
  skills: Skill[],
  complete: boolean,
): SkillSearch | null {
  // Seed from the cache so a remount (or a page mounted after another one
  // already built the index) never flashes the fallback.
  const [search, setSearch] = useState<SkillSearch | null>(() =>
    complete ? peekSkillSearch(skills) : null,
  );

  useEffect(() => {
    // While the registry streams in every snapshot is a new, shorter array;
    // indexing those would be wasted work on a target that keeps moving.
    if (!complete) return;

    const cached = peekSkillSearch(skills);
    // Also drops a search built for a previous array when the data changes.
    // The value is wrapped in a thunk: a bare function would be read as a
    // state updater and invoked as `previous => next`.
    setSearch(() => cached);
    if (cached) return;

    // The list is already on screen by now, so spending the next idle moment
    // on the index only risks delaying an interaction — never a paint.
    return scheduleIdle(() => {
      setSearch(() => createSkillSearch(skills));
    });
  }, [skills, complete]);

  return search;
}
