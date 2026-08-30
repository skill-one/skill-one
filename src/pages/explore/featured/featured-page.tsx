import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "../../../components/ui/skeleton";
import {
  fetchFullIndex,
  SKILLS_QUERY_KEY,
} from "../../../lib/skills-api";
import { FEATURED_CATEGORIES } from "../../../data/featured-content";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import type { Skill } from "../../../types/skill";
import { Placeholder } from "../explore-page";
import { SkillCard } from "../skill-card";
import { SkillDetailPanel } from "../skill-detail-panel";
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
  } = useQuery({
    queryKey: [...SKILLS_QUERY_KEY],
    queryFn: fetchFullIndex,
  });

  const slides = useMemo(() => buildHeroSlides(index ?? []), [index]);

  const sections = useMemo<FeaturedSection[]>(() => {
    const resolved = FEATURED_CATEGORIES.map((category) => ({
      id: category.id,
      title: category.title,
      skills: category.skills
        .map((ref) =>
          index?.find((s) => s.repo === ref.repo && s.name === ref.name),
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
  }, [index]);

  const flat = useMemo(
    () => sections.flatMap((section) => section.skills),
    [sections],
  );

  // Index into `flat` of the skill shown in the detail panel; null keeps the
  // panel closed. A stale index (e.g. after a shrinking refetch) resolves to
  // null, which just closes the panel.
  const [selected, setSelected] = useState<number | null>(null);
  const selectedSkill =
    selected != null ? (flat[selected]?.skill ?? null) : null;

  const handlePrev = () => {
    if (selected != null) setSelected(Math.max(0, selected - 1));
  };
  const handleNext = () => {
    if (selected == null || selected + 1 >= flat.length) return;
    setSelected(selected + 1);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      <div className="flex min-h-0 flex-1 flex-row">
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
          ) : isLoading || !index ? (
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
                  <div
                    className={cn(
                      "grid gap-4 sm:grid-cols-2",
                      // The detail panel takes ~440px; drop to two columns
                      // while it is open so the cards keep a readable width.
                      selectedSkill == null && "lg:grid-cols-3",
                    )}
                  >
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

        <SkillDetailPanel
          skill={selectedSkill}
          onPrev={handlePrev}
          onNext={handleNext}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  );
}
