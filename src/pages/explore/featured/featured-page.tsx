import { useMemo, useState } from "react";

import { Skeleton } from "../../../components/ui/skeleton";
import { useFeaturedData } from "../../../hooks/use-featured-data";
import { Button } from "../../../components/ui/button";
import type { Skill } from "../../../types/skill";
import { Placeholder } from "../explore-page";
import { SkillCard } from "../skill-card";
import { SkillDetailDrawer } from "../skill-detail-drawer";
import { FeaturedHero } from "./featured-hero";

/** Loading placeholder mirroring the page layout: hero plus two sections. */
function FeaturedSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <Skeleton className="h-56 w-full rounded-2xl" />
      {[0, 1].map((section) => (
        <div key={section}>
          <Skeleton className="mb-4 h-7 w-24" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[136px] rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The store's curated landing page: computed leaderboard banners on top,
 * hand-curated category sections of skill cards below.
 *
 * Both the hero slides and the section grids arrive precomputed from the
 * registry worker (rankings and curated joins only mean anything against
 * the whole registry, so the page keeps its skeleton until the worker is
 * ready). Curated references missing from the index are skipped inside the
 * worker and empty sections are hidden, so stale curation narrows the page
 * instead of breaking it.
 */
export function FeaturedPage() {
  // `isPending`, not `isLoading`: the query stays disabled until the worker
  // is ready, and a disabled query never fetches — so isLoading would be
  // false and the page would flash its empty state instead of the skeleton.
  const { data, isPending, isError, error, refetch } = useFeaturedData();

  const slides = data?.slides ?? [];
  const sections = data?.sections ?? [];

  const flat = useMemo(
    () => sections.flatMap((section) => section.skills),
    [sections],
  );

  // Index into `flat` of the skill shown in the detail panel; null keeps the
  // panel closed (open/close, prev/next bounds live in `SkillDetailSheet`).
  const [selected, setSelected] = useState<number | null>(null);
  const flatSkills = useMemo(() => flat.map((s) => s.skill), [flat]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Symmetric 12px horizontal padding (offset by matching negative
          margins, so content position and card widths are unchanged)
          reserves room beside the cards for the overlay scrollbar instead
          of letting it overlap them. */}
      <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-6">
        {isError ? (
          <Placeholder
            message={`加载失败：${error instanceof Error ? error.message : "未知错误"}`}
          >
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void refetch()}
            >
              重试
            </Button>
          </Placeholder>
        ) : isPending ? (
          <FeaturedSkeleton />
        ) : sections.length === 0 ? (
          <Placeholder message="暂无精选内容" />
        ) : (
          <div className="flex flex-col gap-8">
            <FeaturedHero slides={slides} />
            {sections.map((section) => (
              <section key={section.id} aria-label={section.title}>
                <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">
                  {section.title}
                </h2>
                {/* The detail drawer overlays the grid; the layout never
                      changes when it opens or closes. */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.skills.map(({ skill, index: i }) => (
                    <SkillCard
                      key={`${skill.repo}/${skill.name}`}
                      skill={skill}
                      selected={i === selected}
                      onSelect={() => setSelected(i)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Modal detail drawer shared with the explore page. */}
      <SkillDetailDrawer
        skills={flatSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
