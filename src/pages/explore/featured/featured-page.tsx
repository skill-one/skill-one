import { useMemo, useState } from "react";

import { Skeleton } from "../../../components/ui/skeleton";
import { useSkillsIndex } from "../../../hooks/use-skills-index";
import { FEATURED_CATEGORIES } from "../../../data/featured-content";
import { Button } from "../../../components/ui/button";
import type { Skill } from "../../../types/skill";
import { Placeholder } from "../explore-page";
import { SkillCard } from "../skill-card";
import { SkillDetailDrawer } from "../skill-detail-drawer";
import { FeaturedHero } from "./featured-hero";
import { buildHeroSlides } from "./featured-rankings";

/** One resolved curated section, with global card indexes for the panel. */
interface FeaturedSection {
  id: string;
  title: string;
  skills: Array<{ skill: Skill; index: number }>;
}

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
 * Both the hero slides and the category grids join against the single
 * registry index shared with the explore page (same query key). Curated
 * references missing from the index are skipped and empty sections are
 * hidden, so stale curation narrows the page instead of breaking it.
 */
export function FeaturedPage() {
  const {
    data: index,
    isLoading,
    isError,
    error,
    refetch,
  } = useSkillsIndex();

  // Rankings and curated joins only mean anything against the whole
  // registry, so the page keeps its skeleton until the stream completes —
  // unlike the explore page, it never renders partial data.
  const registry = useMemo(
    () => (index?.complete ? index.skills : []),
    [index],
  );

  const slides = useMemo(() => buildHeroSlides(registry), [registry]);

  const sections = useMemo<FeaturedSection[]>(() => {
    const resolved = FEATURED_CATEGORIES.map((category) => ({
      id: category.id,
      title: category.title,
      skills: category.skills
        .map((ref) =>
          registry.find((s) => s.repo === ref.repo && s.name === ref.name),
        )
        .filter((skill): skill is Skill => skill != null),
    })).filter((category) => category.skills.length > 0);
    // Number the resolved skills across sections so the detail panel can
    // walk the whole curated list with prev/next.
    let next = 0;
    return resolved.map((category) => ({
      ...category,
      skills: category.skills.map((skill) => ({
        skill,
        index: next++,
      })),
    }));
  }, [registry]);

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
      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
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
          ) : isLoading || !index?.complete ? (
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
