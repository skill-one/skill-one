import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Star } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./ui/hover-card";

import { openExternal } from "../lib/open-external";
import { cn, formatCount } from "../lib/utils";
import { OwnerAvatar } from "./owner-avatar";

/**
 * A skill's author as one chip on the card's metadata rail: the source's owner
 * avatar, with a hover card that names the source it stands for.
 *
 * The avatar alone only says "someone published this" — the face is small, and
 * on the rail it is the one mark with no words next to it — so the hover card
 * answers *which* source it belongs to, and the name it prints is itself the
 * one action that belongs to a source: opening it, with the external mark
 * beside it saying where the click lands. Clicking the avatar reveals the same
 * card (the touch path; hover and keyboard focus open it on their own), and
 * never falls through to the card, whose body opens the detail panel.
 */
export function RepoHoverCard({
  repo,
  stars,
  className,
}: {
  /** `owner/repo`, or a bare host for a well-known source. */
  repo: string;
  /** The repo's GitHub stars, when the surface knows them. */
  stars?: number;
  /** The avatar's footprint, which each caller sizes to its own slot. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  // The mirror only lists GitHub skills, so its sources are `owner/repo` and
  // the name is the owner. skills.sh also publishes "well-known" sources that
  // are a bare host — `smithery.ai`, `modelscope.cn` — where the host is both
  // who published the skill and the page that documents it: there is no
  // repository name to prefix with GitHub, the host *is* the address.
  const [owner, name] = repo.split("/");
  const source = name ? t("common.repository") : t("common.source");
  const href = name ? `https://github.com/${repo}` : `https://${repo}`;

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={t("common.repoAria", { source, repo })}
            onClick={(e) => {
              // Hover/focus already open the card; the click only makes sure it
              // is open (touch). It must not reach the card body behind it.
              e.stopPropagation();
              setOpen(true);
            }}
            className="shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <OwnerAvatar owner={owner} className={className} />
          </button>
        }
      />
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={6}
        // Portaled, but React still bubbles the events up the component
        // tree — through the rail into the card, whose body opens the
        // detail panel. Reading the card must not do that.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "z-50 w-64 rounded-lg border bg-background p-2.5 shadow-md",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
        )}
      >
        {/* The source names itself and opens itself: the name *is* the link,
            with the mark that says it leaves the app right behind it. Who
            hovers an author chip wants the source, not a menu of things to do
            with it, so the separate "打开" line — a second row of the same
            card, stating what the name already offers — is gone; the icon
            brightens instead, which is where the pointer is. */}
        <a
          href={href}
          aria-label={
            name
              ? t("common.openOnGitHubAria", { repo })
              : t("common.openAria", { repo })
          }
          onClick={(e) => {
            e.preventDefault();
            void openExternal(href);
          }}
          className="group flex min-w-0 items-center gap-1 text-[12px] font-medium"
        >
          <span className="truncate">{repo}</span>
          <ExternalLink
            className="h-3 w-3 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground"
            aria-hidden
          />
        </a>
        {stars != null && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Star
              className="h-3 w-3 fill-amber-400 text-amber-400"
              aria-hidden
            />
            {/* One text run: the unit belongs to the number, not beside it. */}
            <span className="font-medium tabular-nums">
              {t("common.stars", { count: formatCount(stars) })}
            </span>
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
