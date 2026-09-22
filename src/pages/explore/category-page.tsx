import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useReturn } from "../../hooks/use-return";
import { domainDisplay } from "../../data/domains";
import { skillKey } from "../../lib/skill-view";
import {
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Button } from "../../components/ui/button";
import { SkillRow } from "./skill-row";

/** How many card-shaped placeholders stand in while the index streams in. */
const SKELETON_ROWS = 8;

/**
 * How many rows mount with the page, and how many more each scroll-to-bottom
 * reveals. A category can gather hundreds of skills and has no pagination, so
 * rendering — not folding — is what paces the list: the first chunk paints with
 * the page, and each scroll extends the run until the whole category is
 * mounted.
 */
const INITIAL_ROWS = 12;
const ROW_CHUNK = 12;

/**
 * One category's page: every skill classified under it, uncapped.
 *
 * This is what a category card's bar hands over to, exactly as `RepoPage` is
 * what a repository card's bar hands over to. The card is a summary — a bounded
 * list of a category's leaders plus a count of what it left out — and it is the
 * wrong surface for "what else is in here?", which is a list of one category's
 * own skills and nothing else on screen. So the page is exactly that: the
 * category's emoji and name at the top, then its skills as one numbered list —
 * a row each, revealed a chunk at a time as the reader scrolls — with the
 * detail panel walking only this category's skills.
 *
 * It reads its data out of the query the explore list already runs
 * (`useRegistryGroups("", "domain")`), which the query cache has therefore
 * usually answered already: arriving from a card costs no request at all. The
 * unfiltered answer is deliberate — the page answers "all of this category's
 * skills", so a search that led the reader here does not narrow it.
 *
 * Until the index says it is complete, a category not (yet) in the answer is a
 * category the stream has not reached: the page holds a skeleton, the same as
 * the list it came from. Only once the index is complete does an absent
 * category mean what it says — the dataset does not carry it.
 */
export function CategoryPage() {
  const domain = useParams().domain ?? "";

  // The way out: back to the store list when the reader came from it, and to it
  // by replacement when they arrived here directly.
  const back = useReturn("/explore");

  const stats = useRegistryStats();
  const { data } = useRegistryGroups("", "domain");
  const group = data?.groups.find(
    (candidate) => candidate.key === `domain-${domain}`,
  );
  const skills = useMemo(
    () => (group?.skills ?? []).map((hit) => hit.skill),
    [group],
  );

  // The list reveals itself a chunk at a time; `resetKey` re-seeds it when a
  // different category's page takes over the route without remounting.
  const { count, sentinelRef, done } = useProgressiveReveal({
    total: skills.length,
    initial: INITIAL_ROWS,
    step: ROW_CHUNK,
    resetKey: domain,
  });
  const shown = skills.slice(0, count);

  const [selected, setSelected] = useState<string | null>(null);

  // Nothing to show yet: either the stream has not reached this category, or
  // the download failed before it could serve anything (the explore page draws
  // the same line between the two).
  const failure = stats.count === 0 && !stats.complete ? stats.error : null;
  const missing = group == null && stats.ready && failure == null;

  const meta = domainDisplay(domain);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Back to the list the reader came from — the entry itself, and with it
          the view (grouping dimension and all), the search and the scroll
          position the list was left at (see `useReturn`). */}
      <Link
        to={back.to}
        onClick={back.onClick}
        className="mb-3 flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        返回探索
      </Link>

      {/* The category's identity, in the same voice as the card's bar: the
          glyph in place of an avatar, the name, and how many skills it holds. */}
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-base"
        >
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {meta.name}
          </h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="tabular-nums">{skills.length} 个 skill</span>
            {meta.description && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{meta.description}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
        {failure ? (
          <Placeholder message={`加载失败：${failure}`}>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={stats.refetch}
            >
              重试
            </Button>
          </Placeholder>
        ) : missing ? (
          <Placeholder message={`索引中没有分类 ${meta.name}`} />
        ) : group == null ? (
          <SkeletonList
            rows={SKELETON_ROWS}
            listClassName={SKILL_ROW_LIST_CLASS}
            itemClassName={SKILL_ROW_SKELETON_CLASS}
          />
        ) : (
          <>
            <ul className={SKILL_ROW_LIST_CLASS}>
              {shown.map((skill, index) => (
                <SkillRow
                  key={skillKey(skill)}
                  skill={skill}
                  index={index}
                  selected={skillKey(skill) === selected}
                  onSelect={() => setSelected(skillKey(skill))}
                />
              ))}
            </ul>
            {/* The sentinel ends the rendered run: while it is on screen the
                observer extends the run, so scrolling down — or simply having
                a tall viewport — keeps revealing rows until every skill of the
                category is mounted. */}
            {!done && <div ref={sentinelRef} aria-hidden="true" />}
          </>
        )}
      </div>

      {/* The panel walks this category's skills, not the store's answer: the
          page is one category, so prev/next stays inside it. */}
      <SkillDetailDrawer
        skills={skills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
