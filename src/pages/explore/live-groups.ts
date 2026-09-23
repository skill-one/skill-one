import type { SkillView } from "../../lib/skill-view";

/**
 * The live skills.sh answer, re-filed by repository for the store's
 * repository unit.
 *
 * The unit switch decides what the list is made of — one repository card
 * each, or one skill row each — and the live section obeys it like the local
 * answer does (see `explore-page`). A live hit already carries the pair the
 * grouping needs (`skill.repo`, `skill.name`), so the re-filing is pure data
 * work: bucket the flat answer by its repository, keeping the endpoint's own
 * relevance order as the buckets' order (first appearance), and sort each
 * bucket's skills most-installed first — the order a repository card lists
 * its skills in (see `RepoCard`). The sort is stable, so equally-installed
 * skills keep the endpoint's order.
 *
 * The caller hands over the deduped answer (hits the local answer already
 * covers are gone before this runs), so a repository whose every hit was
 * covered never produces an empty bucket here.
 */

/** One repository bucket of the live answer. */
export interface LiveRepoGroup {
  /**
   * Stable React key: the repository, namespaced with `live:` so a live
   * bucket cannot collide with a local group's key (`owner/repo`).
   */
  key: string;
  /**
   * The bucket's name: `owner/repo` — or a bare discovery domain, when
   * upstream files the skill under one rather than a repository.
   */
  title: string;
  /** The bucket's skills, most installed first. */
  skills: SkillView[];
}

/** Group the deduped live answer by repository, endpoint order preserved. */
export function buildLiveRepoGroups(
  skills: readonly SkillView[],
): LiveRepoGroup[] {
  const buckets = new Map<string, LiveRepoGroup>();
  for (const skill of skills) {
    let bucket = buckets.get(skill.repo);
    if (!bucket) {
      bucket = { key: `live:${skill.repo}`, title: skill.repo, skills: [] };
      buckets.set(skill.repo, bucket);
    }
    bucket.skills.push(skill);
  }
  const groups = [...buckets.values()];
  for (const group of groups) {
    group.skills = group.skills.toSorted((a, b) => b.downloads - a.downloads);
  }
  return groups;
}
