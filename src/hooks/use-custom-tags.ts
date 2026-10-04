import { useQuery } from "@tanstack/react-query";

import { registerCustomTagMeta } from "../data/domains";
import {
  loadCustomTags,
  type CustomTags,
} from "../lib/provenance";
import { customTagMeta } from "../lib/custom-tags";
import { PROVENANCE_QUERY_KEY } from "./use-installed-skills";

/**
 * The user taxonomy plus every installed skill's tag choice, read off the
 * provenance ledger. Shares the provenance query prefix, so every
 * `markSkillsChanged` (install, remove, link, tag edit alike) refreshes it
 * alongside the sources it rides with.
 *
 * Reading also registers the definitions into the domain resolvers: badges,
 * glyphs, facets and tooltips look tags up by key through `domainMeta` and
 * friends, and registration is what makes a user key resolve there. Additive
 * and idempotent — system keys are rejected at creation, so the static
 * taxonomy is never overwritten, only extended.
 */
export function useCustomTags() {
  const query = useQuery<CustomTags>({
    queryKey: [...PROVENANCE_QUERY_KEY, "custom-tags"],
    queryFn: loadCustomTags,
  });
  // Registered during render, not in an effect: the badges, glyphs and
  // facets below resolve tags through `domainMeta` in the same commit, so
  // the keys must be known before they read. Additive and idempotent, so a
  // re-render (or StrictMode's double render) changes nothing.
  const tagDefs = query.data?.tagDefs;
  if (tagDefs) {
    for (const { key, label, emoji } of tagDefs) {
      registerCustomTagMeta(customTagMeta(key, label, emoji));
    }
  }
  return query;
}
