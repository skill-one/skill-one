import { useState } from "react";

import type { SearchField } from "../../lib/registry/protocol";
import { cn } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { OwnerAvatar } from "../../components/owner-avatar";
import { DomainBadge } from "../../components/domain-badge";
import { SkillInstallButton } from "../../components/skill-install-button";
import { SkillPopularity } from "../../components/skill-popularity";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

/** Matched indexed terms per field, from the search that produced this hit. */
export type SkillMatched = Partial<Record<SearchField, readonly string[]>>;

/**
 * Splits text on the same separator class MiniSearch's default tokenizer uses,
 * so each non-separator segment is exactly one indexed token and can be
 * compared to the matched terms (which are always whole tokens).
 */
const TOKEN_SPLIT = /([\n\r\p{Z}\p{P}]+)/u;

/**
 * Text with search-match highlighting: tokens present in `terms` are wrapped in
 * `<mark>`. Without terms the text renders as a single node, keeping the
 * non-search DOM identical to an unhighlighted one.
 */
function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms?: readonly string[];
}) {
  if (!terms?.length) return text;
  const matched = new Set(terms);
  return (
    <>
      {text.split(TOKEN_SPLIT).map((segment, i) =>
        matched.has(segment.toLowerCase()) ? (
          <mark
            key={i}
            className="rounded-[2px] bg-primary/15 text-inherit dark:bg-primary/25"
          >
            {segment}
          </mark>
        ) : (
          segment
        ),
      )}
    </>
  );
}

/**
 * One skill in the store's list — the shape every skill surface uses, built on
 * the shadcn Card so it is laid out by the component's own slots rather than by
 * hand: the header holds the avatar, name and source with the install action in
 * the corner slot that `CardAction` exists for, the content holds the
 * description, and the footer holds the domain chip and the popularity figure —
 * classification on the left rail under the source it belongs to, the figure on
 * the right rail under the action. Hovering or focusing the figure breaks it
 * back down into the installs and stars it blends.
 *
 * The card carries no surface-specific extras — no rank chip, no alternative
 * metric — so the store list, a repo's skills, a leaderboard and the installed
 * list are one card in one layout, and the only thing that differs between
 * them is the order their data arrives in.
 *
 * The action sits in the card's top-right corner, not by the popularity figure,
 * because that is where the detail drawer keeps it too ("the primary action
 * lives in the header") — and because the button carries state (安装 / 安装中 /
 * 已安装 / 重试), a fixed corner turns the grid's right edge into one column a
 * reader can scan to see what they already have.
 *
 * The card body opens the detail panel (`onSelect`); the install action goes
 * through the skills backend (Tauri) or the mock store (browser), reflects
 * loading / success / failure, and stops its own click so it never opens the
 * panel behind it. A failed install reports its message under the card.
 */
export function SkillListRow({
  skill,
  matched,
  selected = false,
  onSelect,
}: {
  skill: Skill;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Whether this card is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
}) {
  // The failure message of the last install attempt, shown under the card.
  const [installError, setInstallError] = useState<string | null>(null);

  const owner = skill.repo.split("/")[0];

  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: it fills the grid cell
          so a short card's border still lines up with its taller neighbours. */}
      <Card
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? `查看 ${skill.name} 详情` : undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex-1",
          onSelect &&
            "cursor-pointer transition-all duration-150 hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)]",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <CardHeader>
          {/* The name is the card's heading, so it stays an `h3` inside the
              title slot rather than losing its meaning to a styled `div`. */}
          <CardTitle className="flex items-center gap-2">
            <OwnerAvatar owner={owner} className="h-6 w-6 shrink-0 text-[11px]" />
            <h3 className="truncate">
              <HighlightedText text={skill.name} terms={matched?.name} />
            </h3>
          </CardTitle>
          {/* The description slot carries the source alone. The domain chip
              used to share it, which cost the source the chip's width (and let
              the chip's position drift with the length of the repo name);
              it reads better in the footer next to the figure. */}
          <CardDescription className="truncate">
            <HighlightedText text={skill.repo} terms={matched?.repo} />
          </CardDescription>
          <CardAction>
            <SkillInstallButton skill={skill} onError={setInstallError} />
          </CardAction>
        </CardHeader>

        <CardContent className="line-clamp-2 text-sm text-muted-foreground">
          <HighlightedText
            text={skill.description || "暂无描述"}
            terms={matched?.description}
          />
        </CardContent>

        {/* Pinned to the card's bottom edge: descriptions differ in length, and
            the two ends should still line up across a row. Classification on
            the left under the source it belongs to, the figure on the right
            under the install action — the two rails the card is already read
            in, and the reason neither end is left floating in the middle. */}
        <CardFooter className="mt-auto">
          {/* Domain from the profiles dataset; absent for skills it has not
              profiled, so the figure simply keeps the right edge alone. */}
          {skill.profile?.domain && (
            <DomainBadge
              domain={skill.profile.domain}
              reason={skill.profile.reason}
              className="shrink-0 rounded-full px-2 py-0 text-[10px] font-normal text-muted-foreground"
            />
          )}
          <SkillPopularity
            skill={skill}
            side="top"
            align="end"
            className="ml-auto"
          />
        </CardFooter>
      </Card>

      {installError && (
        <p
          role="alert"
          className="mt-1 line-clamp-2 px-4 text-[12px] leading-relaxed text-destructive"
        >
          {installError}
        </p>
      )}
    </li>
  );
}
