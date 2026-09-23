import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { ExternalLink, Star } from "lucide-react";

import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { openExternal } from "../../lib/open-external";
import { skillKey } from "../../lib/skill-view";
import {
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { formatCount } from "../../lib/utils";
import { OwnerAvatar } from "../../components/owner-avatar";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Button } from "../../components/ui/button";
import { SkillRow } from "./skill-row";

/** How many card-shaped placeholders stand in while the index streams in. */
const SKELETON_ROWS = 8;

/**
 * How many rows mount with the page, and how many more each scroll-to-bottom
 * reveals. A repository can publish hundreds of skills and has no pagination,
 * so rendering — not folding — is what paces the list: the first chunk paints
 * with the page, and each scroll extends the run until the whole repository is
 * mounted.
 */
const INITIAL_ROWS = 12;
const ROW_CHUNK = 12;

/**
 * One repository's page: every skill it publishes, uncapped.
 *
 * This is what a repository card's head and tail hand over to. The card is a
 * summary — a bounded list of a repository's leaders plus a count of what it
 * left out — and it is the wrong surface for the question "what else does this
 * repository have?", which is a list of one repository's own skills and nothing
 * else on screen. So the page is exactly that: the repository's identity at the
 * top, then its skills as one numbered list — a row each, revealed a chunk at a
 * time as the reader scrolls — with the detail panel walking only this
 * repository's skills.
 *
 * It reads its data out of the query the explore list already runs
 * (`useRegistryGroups("")`), which the query cache has therefore usually
 * answered already: arriving from a card costs no request at all. The
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

  const stats = useRegistryStats();
  const { data } = useRegistryGroups("");
  const group = data?.groups.find((candidate) => candidate.key === `repo-${repo}`);
  const skills = useMemo(
    () => (group?.skills ?? []).map((hit) => hit.skill),
    [group],
  );

  // The list reveals itself a chunk at a time; `resetKey` re-seeds it when a
  // different repository's page takes over the route without remounting.
  const { count, sentinelRef, done } = useProgressiveReveal({
    total: skills.length,
    initial: INITIAL_ROWS,
    step: ROW_CHUNK,
    resetKey: repo,
  });
  const shown = skills.slice(0, count);

  const [selected, setSelected] = useState<string | null>(null);

  // Nothing to show yet: either the stream has not reached this repository, or
  // the download failed before it could serve anything (the explore page draws
  // the same line between the two).
  const failure =
    stats.count === 0 && !stats.complete ? stats.error : null;
  const missing = group == null && stats.ready && failure == null;

  const [owner] = repo.split("/");

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The way back to the list is the header's first row: this page is inside
          the store, and the header is where every page says what it is and how
          to leave it (see `AppHeader`).

          What is left here is the repository's identity, in the same voice as
          the card's head: who published it, what it is called, and the two
          figures the card showed there as well. */}
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
                  // The page's head already names the repository, so its rows
                  // do not repeat it on every line.
                  showSource={false}
                  onSelect={() => setSelected(skillKey(skill))}
                />
              ))}
            </ul>
            {/* The sentinel ends the rendered run: while it is on screen the
                observer extends the run, so scrolling down — or simply having
                a tall viewport — keeps revealing rows until every skill of the
                repository is mounted. */}
            {!done && <div ref={sentinelRef} aria-hidden="true" />}
          </>
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
