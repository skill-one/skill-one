import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ExternalLink, Star } from "lucide-react";

import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useReturn } from "../../hooks/use-return";
import { openExternal } from "../../lib/open-external";
import { skillKey } from "../../lib/skill-view";
import {
  SKILL_CARD_SKELETON_CLASS,
  SKILL_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { formatCount } from "../../lib/utils";
import { OwnerAvatar } from "../../components/owner-avatar";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Button } from "../../components/ui/button";
import { SkillListRow } from "./skill-list-row";

/** How many card-shaped placeholders stand in while the index streams in. */
const SKELETON_ROWS = 8;

/**
 * One repository's page: every skill it publishes, uncapped.
 *
 * This is what a repository card's head and tail hand over to. The card is a
 * summary — a bounded list of a repository's leaders plus a count of what it
 * left out — and it is the wrong surface for the question "what else does this
 * repository have?", which is a list of one repository's own skills and nothing
 * else on screen. So the page is exactly that: the repository's identity at the
 * top, then the same per-skill cards the store's lists use, one per skill, with
 * the detail panel walking only this repository's skills.
 *
 * It reads its data out of the query the explore list's repository mode already
 * runs (`useRegistryGroups("", "repo")`), which the query cache has therefore
 * usually answered already: arriving from a card costs no request at all. The
 * unfiltered answer is deliberate — the page answers "all of this repository's
 * skills", so a search that led the reader here does not narrow it.
 *
 * Until the index says it is complete, a repository that is not (yet) in the
 * answer is a repository the stream has not reached: the page holds a skeleton,
 * the same as the list it came from. Only once the index is complete does an
 * absent repository mean what it says — the dataset does not carry it.
 */
export function RepoPage() {
  // The repository is the route's splat rather than a path parameter: it is
  // `owner/repo`, and it carries a slash of its own.
  const repo = useParams()["*"] ?? "";

  // The way out: back to the store list when the reader came from it, and to it
  // by replacement when they arrived here directly.
  const back = useReturn("/explore");

  const stats = useRegistryStats();
  const { data } = useRegistryGroups("", "repo");
  const group = data?.groups.find((candidate) => candidate.key === `repo-${repo}`);
  const skills = useMemo(
    () => (group?.skills ?? []).map((hit) => hit.skill),
    [group],
  );

  const [selected, setSelected] = useState<string | null>(null);

  // Nothing to show yet: either the stream has not reached this repository, or
  // the download failed before it could serve anything (the explore page draws
  // the same line between the two).
  const failure =
    stats.count === 0 && !stats.complete ? stats.error : null;
  const missing = group == null && stats.ready && failure == null;

  const [owner] = repo.split("/");

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Back to the list the reader came from — the entry itself, and with it
          the search, the revealed depth and the scroll position the list was
          left at (see `useReturn`). The href is where the control points when
          there is no entry behind this one, and it is what a modified click
          and assistive tech read. */}
      <Link
        to={back.to}
        onClick={back.onClick}
        className="mb-3 flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        返回探索
      </Link>

      {/* The repository's identity, in the same voice as the card's head: who
          published it, what it is called, and the two figures the card showed
          there as well. */}
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <OwnerAvatar owner={owner} className="size-10 shrink-0 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {repo}
          </h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums">
            {group?.stars !== undefined && (
              <>
                <Star
                  className="h-3 w-3 fill-amber-400 text-amber-400"
                  aria-hidden
                />
                {formatCount(group.stars)} Star
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{skills.length} 个 skill</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void openExternal(`https://github.com/${repo}`)}
          className="shrink-0"
        >
          <ExternalLink />
          在 GitHub 打开
        </Button>
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
          <Placeholder message={`索引中没有仓库 ${repo}`} />
        ) : group == null ? (
          <SkeletonList
            rows={SKELETON_ROWS}
            listClassName={SKILL_LIST_CLASS}
            itemClassName={SKILL_CARD_SKELETON_CLASS}
          />
        ) : (
          <ul className={SKILL_LIST_CLASS}>
            {skills.map((skill) => (
              <SkillListRow
                key={skillKey(skill)}
                skill={skill}
                selected={skillKey(skill) === selected}
                onSelect={() => setSelected(skillKey(skill))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* The panel walks this repository's skills, not the store's answer: the
          page is one repository, so prev/next stays inside it. */}
      <SkillDetailDrawer
        skills={skills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
