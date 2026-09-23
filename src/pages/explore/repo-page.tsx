import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { ChevronUp, ExternalLink, Star } from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import type { Destination } from "../../lib/list-view";
import { openExternal } from "../../lib/open-external";
import {
  installedSkillView,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import {
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import type { InstalledSkill } from "../../lib/skills-manager";
import { formatCount } from "../../lib/utils";
import { DrillDownHead } from "../../components/drill-down-head";
import { OwnerAvatar } from "../../components/owner-avatar";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
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
 * One repository's page: every skill it publishes, or — in the installed list's
 * own reading of it — only the ones already on disk.
 *
 * This is what a repository card's head and tail hand over to, in either list.
 * The card is a summary — a bounded list of a repository's leaders plus a count
 * of what it left out — and it is the wrong surface for the question "what else
 * does this repository have?", which is a list of one repository's own skills
 * and nothing else on screen. So the page is exactly that: the repository's
 * identity at the top, then its skills as one numbered list — a row each,
 * revealed a chunk at a time as the reader scrolls — with the detail panel
 * walking only this repository's skills.
 *
 * `origin` is the list the reader came from, and it decides what the page
 * means:
 *
 * - **from the store**, the repository *is* its catalogue: everything it
 *   publishes is listed, uncapped and unfiltered, and the rows install;
 * - **from the installed list**, the repository is a drawer of things already
 *   taken home: the page opens on the skills that are on disk — the enable
 *   switch in every row, the disabled ones dimmed — and the rest of the
 *   catalogue stays behind the control at the foot of the list, which swaps
 *   the whole reading in place and back.
 *
 * The installed reading is what keeps the two lists telling one story: the card
 * said "these of them are on your machine", and the page it opens says the same
 * thing at full length, with the rest one deliberate step away rather than
 * mixed into what the reader already has.
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
 * absent repository mean what it says — the dataset does not carry it. The
 * installed reading still lists what is on disk in that case, since what is on
 * disk is its own fact and not the index's to state.
 */
export function RepoPage({
  origin = "store",
}: {
  /** The list this page was opened from; see the note above. */
  origin?: Destination;
}) {
  // The repository is the route's splat rather than a path parameter: it is
  // `owner/repo`, and it carries a slash of its own.
  const repo = useParams()["*"] ?? "";

  const stats = useRegistryStats();
  const { data } = useRegistryGroups("");
  const group = data?.groups.find((candidate) => candidate.key === `repo-${repo}`);
  // What the repository publishes, most-installed first — the store's own
  // answer, which is also the installed reading's second half.
  const published = useMemo(
    () => (group?.skills ?? []).map((hit) => hit.skill),
    [group],
  );

  // The installed reading, in the same two facts the installed list groups by:
  // the on-disk records, and the ledger that places them in a repository. Both
  // queries are shared with the rest of the app (see `use-installed-skills`),
  // so the store's own page pays nothing for them being read here.
  const fromInstalled = origin === "installed";
  const { data: installed, isPending: readingDisk } = useInstalledSkills();
  const { data: provenance, isPending: readingLedger } = useSkillProvenance();
  const linked = provenance?.linked;

  // The installs the ledger places in this repository, by skill name — the
  // same association the installed list's cards are grouped by, so the page a
  // card opens cannot disagree with the card about what belongs to it.
  const records = useMemo(() => {
    const placed = new Map<string, InstalledSkill>();
    if (!fromInstalled) return placed;
    for (const record of installed ?? []) {
      if (linked?.[record.name]?.repo === repo) placed.set(record.name, record);
    }
    return placed;
  }, [fromInstalled, installed, linked, repo]);

  // What is on disk, in the repository's own order, plus any install the index
  // no longer publishes — a skill the reader has does not disappear from the
  // repository it came from just because the store moved on. Each row is the
  // shared installed view, so it carries the store facts the registry entry
  // holds (classification, install count) exactly as the installed list's rows
  // do.
  const onDisk = useMemo<SkillView[]>(() => {
    if (!fromInstalled) return [];
    const listed = published.flatMap((skill) => {
      const record = records.get(skill.name);
      return record ? [installedSkillView(record, linked, skill)] : [];
    });
    const named = new Set(listed.map((skill) => skill.name));
    const unpublished = Array.from(records.values())
      .filter((record) => !named.has(record.name))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((record) => installedSkillView(record, linked));
    return [...listed, ...unpublished];
  }, [fromInstalled, published, records, linked]);

  // Whether the repository has a second reading at all: skills it publishes
  // that are not on disk. With none, the two readings are one list (barring an
  // install the index no longer publishes, which the installed one already
  // shows), and a control between them would open nothing new.
  const hasRest = useMemo(
    () => fromInstalled && published.some((skill) => !records.has(skill.name)),
    [fromInstalled, published, records],
  );

  // Which reading is on screen: the installed list opens on what is on disk,
  // the store's page — and the installed page once the reader asks for the rest
  // — lists the repository whole. The state is the page's own, not the shared
  // list view's: it describes this repository's answer, nothing wider.
  const [whole, setWhole] = useState(false);
  const catalogue = whole || !fromInstalled;
  const skills = catalogue ? published : onDisk;

  // The list reveals itself a chunk at a time; `resetKey` re-seeds it when a
  // different repository — or the other reading of this one — takes over the
  // route without remounting.
  const { count, sentinelRef, done } = useProgressiveReveal({
   total: skills.length,
   initial: INITIAL_ROWS,
   step: ROW_CHUNK,
   resetKey: `${repo}\u0000${catalogue ? "all" : "installed"}`,
  });
  const shown = skills.slice(0, count);

  const [selected, setSelected] = useState<string | null>(null);

  // Nothing to show yet: either the stream has not reached this repository, or
  // the download failed before it could serve anything (the explore page draws
  // the same line between the two).
  const failure =
    stats.count === 0 && !stats.complete ? stats.error : null;
  // The index has spoken about this repository and does not carry it.
  const absent = group == null && stats.ready && failure == null;
  // The installed reading's own two facts, still being read: a list that has
  // not read the disk yet is not an empty one, and saying so would be a lie the
  // reader sees for a frame before the installs arrive.
  const reading = fromInstalled && (readingDisk || readingLedger);
  // Nothing to show yet — the stream simply has not said. The installed reading
  // waits for it too: its rows lean on the registry entry for their store
  // facts, and it needs the repository's full count to offer the rest.
  const waiting = reading || (group == null && !absent);

  // What an empty list means, in the reading on screen: a repository whose
  // skills are none of them on disk, or one the index does not carry at all.
  const emptyMessage =
    fromInstalled && !catalogue && !absent
      ? "该仓库没有已安装的 skill"
      : `索引中没有仓库 ${repo}`;

  // The head's figure: published skills in the whole reading, installs in the
  // installed one — the same two numbers the card's bar and its rows showed.
  const headCount = catalogue
    ? `${skills.length} 个 skill`
    : `${skills.length} 个已安装 skill`;

  const [owner] = repo.split("/");

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The page's head: the way back to the list it was opened from, and the
          repository's identity in the same voice as the card's head — who
          published it, what it is called, and the two figures the card showed
          there as well (see `DrillDownHead`).

          The two readings differ in one word of the fallback: the store's page
          goes back to the store, the installed list's to the installed list.
          That is what `origin` buys beyond the rows — a page that pops to the
          list it was opened from rather than to the one it happens to share a
          component with. */}
      <DrillDownHead
        back={fromInstalled ? "/my-skills" : "/explore"}
        avatar={
          <OwnerAvatar owner={owner} className="size-10 shrink-0 text-base" />
        }
        title={repo}
        meta={
          <>
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
            <span>{headCount}</span>
          </>
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openExternal(`https://github.com/${repo}`)}
            className="shrink-0"
          >
            <ExternalLink />
            在 GitHub 打开
          </Button>
        }
      />

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
        ) : waiting ? (
          <SkeletonList
            rows={SKELETON_ROWS}
            listClassName={SKILL_ROW_LIST_CLASS}
            itemClassName={SKILL_ROW_SKELETON_CLASS}
          />
        ) : skills.length === 0 ? (
          <Placeholder message={emptyMessage} />
        ) : (
          <>
            <ul className={SKILL_ROW_LIST_CLASS}>
              {shown.map((skill, index) => {
                // The install record, when this row is one: it is what makes a
                // row carry the enable switch and dim when disabled. In the
                // whole reading the rows are the store's — an installed one
                // says so through its install button, like any store row — so
                // the record only ever matters in the installed reading.
                const record = catalogue ? undefined : records.get(skill.name);
                return (
                  <SkillRow
                    key={skillKey(skill)}
                    skill={skill}
                    index={index}
                    selected={skillKey(skill) === selected}
                    muted={record?.enabled === false}
                    action={
                      record ? <SkillEnableSwitch skill={skill} /> : undefined
                    }
                    // The page's head already names the repository, so its rows
                    // do not repeat it on every line.
                    showSource={false}
                    onSelect={() => setSelected(skillKey(skill))}
                  />
                );
              })}
            </ul>
            {/* The sentinel ends the rendered run: while it is on screen the
                observer extends the run, so scrolling down — or simply having
                a tall viewport — keeps revealing rows until every skill of the
                repository is mounted. */}
            {!done && <div ref={sentinelRef} aria-hidden="true" />}
            {/* The foot of the installed reading: what the repository has that
                this machine does not, stated as the door to it rather than
                mixed into the list above. One press swaps the reading in place;
                the whole catalogue keeps the control so the reader can walk
                back to their own installs without leaving the repository. */}
            {fromInstalled && (hasRest || catalogue) && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWhole((all) => !all)}
                >
                  {catalogue ? (
                    <>
                      <ChevronUp />
                      只看已安装
                    </>
                  ) : (
                    `查看该仓库全部 ${published.length} 个 skill`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* The panel walks this repository's skills, not the store's answer: the
          page is one repository, so prev/next stays inside it. Which chrome it
          wears follows the reading on screen: the installed reading offers the
          enable switch, the whole one the store's install and remove. */}
      <SkillDetailDrawer
        skills={skills}
        selected={selected}
        onSelect={setSelected}
        surface={catalogue ? "store" : "installed"}
      />
    </div>
  );
}
