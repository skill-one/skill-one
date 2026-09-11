import { useQuery } from "@tanstack/react-query";

import { fetchSkillProfile } from "../../lib/skill-profile-api";
import type { SkillProfileDetail } from "../../types/skill";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";

/**
 * The 概述 tab of the detail drawer — its default landing view: the full
 * multi-angle profile the skills-profiles dataset generated for one skill,
 * laid out by content shape — pitch first, then slogans, the outside view
 * (what you hand it → what you get back), the inside view (happy path +
 * mechanisms), and first-person user comments. `domain` and persona.role
 * already show in the drawer header; the persona's scene and tool lead this
 * view instead of being repeated twice.
 *
 * Data comes from five small JSON files fetched on first open (cached by
 * TanStack Query like the SKILL.md body). Sections are individually
 * optional: an unreachable or future-shaped file hides its section only.
 */

/** First-person note categories, in reading order. */
const COMMENT_CATEGORIES: Record<string, { badge: string; rail: string }> = {
  妙用: {
    badge:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    rail: "border-emerald-500/50",
  },
  启发: {
    badge: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    rail: "border-sky-500/50",
  },
  注意: {
    badge:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    rail: "border-amber-500/50",
  },
  坑: {
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    rail: "border-destructive/50",
  },
};

/** Neutral fallback for a category the dataset may add later. */
const DEFAULT_COMMENT_STYLE = {
  badge: "border-border/60 bg-muted text-muted-foreground",
  rail: "border-border/60",
};

function CommentBadge({ category }: { category: string }) {
  return (
    <Badge
      variant="outline"
      className={COMMENT_CATEGORIES[category]?.badge ?? DEFAULT_COMMENT_STYLE.badge}
    >
      {category}
    </Badge>
  );
}

/** One titled block of the profile. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ProfileLoading() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function ProfileBody({ profile }: { profile: SkillProfileDetail }) {
  const empty =
    !profile.scenario &&
    !profile.taglines?.length &&
    !profile.blackbox &&
    !profile.whitebox &&
    !profile.comments?.length;
  if (empty) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        暂无概述内容
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {profile.taglines && profile.taglines.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.taglines.map((tagline) => (
            <Badge
              key={tagline}
              variant="secondary"
              className="rounded-full font-normal"
            >
              {tagline}
            </Badge>
          ))}
        </div>
      )}

      {profile.scenario && (
        <p className="text-[13px] leading-relaxed text-foreground/90">
          {profile.scenario}
        </p>
      )}

      {profile.blackbox && (
        <Section title="它解决什么">
          {profile.blackbox.function && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {profile.blackbox.function}
            </p>
          )}
          {profile.blackbox.inputOutput.length > 0 && (
            // Two columns once the panel is document-wide: the pairs are
            // independent, so reading order survives the split.
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {profile.blackbox.inputOutput.map(({ input, output }, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2"
                >
                  <span className="text-[12px] leading-relaxed">
                    <span className="font-medium text-foreground">给：</span>
                    <span className="text-muted-foreground">{input}</span>
                  </span>
                  <span className="text-[12px] leading-relaxed">
                    <span className="font-medium text-foreground">拿回：</span>
                    <span className="text-muted-foreground">{output}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {profile.whitebox && (
        <Section title="它怎么工作">
          {profile.whitebox.executionFlow.length > 0 && (
            <ol className="flex list-decimal flex-col gap-1 pl-4 marker:text-muted-foreground/60">
              {profile.whitebox.executionFlow.map((step, i) => (
                <li
                  key={i}
                  className="text-[12px] leading-relaxed text-muted-foreground"
                >
                  {step}
                </li>
              ))}
            </ol>
          )}
          {profile.whitebox.mechanisms.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-muted-foreground/60">
              {profile.whitebox.mechanisms.map((mechanism, i) => (
                <li
                  key={i}
                  className="text-[12px] leading-relaxed text-muted-foreground"
                >
                  {mechanism}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {profile.comments && profile.comments.length > 0 && (
        <Section title="用户评论">
          {/* Quote-style notes: each one hangs off a category-colored left
              rail, so the category reads before the words. Badge + nickname
              form a left-aligned attribution line above the body — the
              dataset has no avatars or timestamps. */}
          <ul className="mt-1 flex flex-col gap-3">
            {profile.comments.map(({ user, category, comment }, i) => (
              <li
                key={i}
                className={`flex flex-col gap-1.5 border-l-2 pl-3 ${
                  COMMENT_CATEGORIES[category]?.rail ??
                  DEFAULT_COMMENT_STYLE.rail
                }`}
              >
                <div className="flex items-center gap-2">
                  <CommentBadge category={category} />
                  <span className="truncate text-[11px] text-muted-foreground">
                    {user}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/85">
                  {comment}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function SkillProfileView({
  skillId,
  knownPath,
  scene,
  tool,
}: {
  skillId: string;
  /** The mirror-relative directory the profile id is derived from. */
  knownPath?: string;
  /** Persona scene from the index entry — the lead quote of this view. */
  scene?: string;
  /** Persona tool from the index entry. */
  tool?: string;
}) {
  const {
    data: profile,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["skill-profile", skillId, knownPath],
    queryFn: () => fetchSkillProfile(skillId, knownPath),
    enabled: knownPath != null,
    staleTime: 10 * 60 * 1000,
    gcTime: Infinity,
    retry: false,
  });

  if (isPending) return <ProfileLoading />;
  if (isError || !profile) {
    // The default landing view: a failed fetch must hand the reader off to
    // the canonical source instead of dead-ending the first impression.
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">
        概述暂不可用，可查看 SKILL.md
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {(scene || tool) && (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
          {scene && (
            <p className="text-[13px] italic leading-relaxed text-foreground/90">
              “{scene}”
            </p>
          )}
          {tool && (
            <p className="text-[11px] text-muted-foreground/70">
              谋生工具：<span className="font-mono">{tool}</span>
            </p>
          )}
        </div>
      )}
      <ProfileBody profile={profile} />
    </div>
  );
}
