import { useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { HoverCard } from "radix-ui";

import { openExternal } from "../lib/open-external";
import { cn, formatCount } from "../lib/utils";
import { OwnerAvatar } from "./owner-avatar";

/**
 * A skill's author as one chip on the card's metadata rail: the source repo's
 * owner avatar, with a hover card that names the repository it stands for.
 *
 * The avatar alone only says "someone published this" — the face is small, and
 * on the rail it is the one mark with no words next to it — so the hover card
 * answers *which* repository it belongs to and offers the one action that
 * belongs to a repository: opening it on GitHub. Clicking the avatar reveals
 * the same card (the touch path; hover and keyboard focus open it on their
 * own), and never falls through to the card, whose body opens the detail
 * panel.
 */
export function RepoHoverCard({
  repo,
  stars,
  className,
}: {
  /** `owner/repo` — the repository the avatar stands for. */
  repo: string;
  /** The repo's GitHub stars, when the surface knows them. */
  stars?: number;
  /** The avatar's footprint, which each caller sizes to its own slot. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // The source is always `owner/repo` (the mirror only lists GitHub skills).
  const [owner] = repo.split("/");
  const href = `https://github.com/${repo}`;

  return (
    <HoverCard.Root
      open={open}
      onOpenChange={setOpen}
      openDelay={150}
      closeDelay={100}
    >
      <HoverCard.Trigger asChild>
        <button
          type="button"
          aria-label={`仓库 ${repo}`}
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
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={6}
          // Portaled, but React still bubbles the events up the component
          // tree — through the rail into the card, whose body opens the
          // detail panel. Reading the card must not do that.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "z-50 w-64 rounded-lg border bg-background p-2.5 shadow-md",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <p className="truncate text-[12px] font-medium">{repo}</p>
          {stars != null && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Star
                className="h-3 w-3 fill-amber-400 text-amber-400"
                aria-hidden
              />
              {/* One text run: the unit belongs to the number, not beside it. */}
              <span className="font-medium tabular-nums">
                {formatCount(stars)} Star
              </span>
            </p>
          )}
          <a
            href={href}
            aria-label={`在 GitHub 中打开 ${repo}`}
            onClick={(e) => {
              e.preventDefault();
              void openExternal(href);
            }}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            在 GitHub 中打开
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
