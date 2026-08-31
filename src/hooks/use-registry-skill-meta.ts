import { useQuery } from "@tanstack/react-query";

import { lookupSkills } from "../lib/registry/client";
import type { SkillRef } from "../lib/registry/protocol";
import type { Skill } from "../types/skill";
import { useRegistryStats } from "./use-registry-stats";

/** Query-key prefix of the installed-skills ↔ registry metadata join. */
const REGISTRY_SKILL_META_PREFIX = "registry-skill-meta";

/**
 * Registry metadata for installed skills, resolved inside the worker. The
 * returned map is keyed by `${repo}/${name}` exactly as the refs were
 * requested; refs with no registry entry are absent from the map.
 *
 * Best-effort by design: until the worker is ready (or on failure) the map
 * stays empty and store-sourced skills degrade to hiding downloads/description
 * fallbacks — the same contract the full download used to provide.
 */
export function useRegistrySkillMeta(refs: SkillRef[]): Map<string, Skill> {
  const { ready } = useRegistryStats();
  // Arrays are new objects every render; serialize for a stable query key.
  const key = JSON.stringify(refs);
  const { data } = useQuery({
    queryKey: [REGISTRY_SKILL_META_PREFIX, key],
    queryFn: () => lookupSkills(JSON.parse(key) as SkillRef[]),
    enabled: ready,
  });
  const map = new Map<string, Skill>();
  const entries = data?.entries;
  if (entries) {
    const parsed = JSON.parse(key) as SkillRef[];
    entries.forEach((entry, i) => {
      const ref = parsed[i];
      if (entry && ref) map.set(`${ref.repo}/${ref.name}`, entry);
    });
  }
  return map;
}
