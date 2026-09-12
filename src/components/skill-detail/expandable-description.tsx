import { useState } from "react";

import { useOverflow } from "../../hooks/use-overflow";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";

/**
 * The skill's own summary in the detail header, clamped to three lines behind
 * an inline 展开/收起 toggle.
 *
 * The detail header keeps this summary pinned above a long-form body that
 * scrolls underneath it, so an unbounded paragraph would push the tab bar and
 * the content down to nothing. The clamp is pure CSS (`line-clamp-3`) with the
 * body force-mounted, so the full text stays in the DOM: in-page search and
 * assistive tech always read the whole summary — the toggle only changes what
 * is painted. It appears only when the text is really clipped, because a short
 * summary must not offer a control that does nothing.
 *
 * The toggle rides the paragraph's own last line in both states, so it never
 * costs a header row. Collapsed it is taken out of flow and painted over the
 * tail of the last line — the Instagram "more" pattern — carrying a
 * background-colored fade that dissolves the clipped text and the ellipsis
 * `line-clamp` draws right where the label lands. (That fade needs a flat
 * theme color to blend into; the header behind it is `bg-background`, which
 * also keeps it correct in dark mode.) Expanded there is nothing left to clip,
 * so the trigger drops back into the flow and simply continues after the last
 * word — pinning it to the line's right edge instead would cover the words
 * already there. Being one and the same element in both states is what keeps
 * focus on the trigger across a toggle.
 */
export function ExpandableDescription({ text }: { text: string }) {
  // The expanded state is derived from the text it applies to: a new skill's
  // summary therefore always starts collapsed, with no reset effect and so no
  // frame of the previous skill's expanded text.
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const open = expandedText === text;
  const { ref, overflowing } = useOverflow<HTMLParagraphElement>(text);

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setExpandedText(next ? text : null)}
    >
      <CollapsibleContent forceMount asChild>
        <p
          ref={ref}
          className={cn(
            // `relative` is the containing block the collapsed trigger is
            // pinned to; it sits inside the paragraph's own box, so the
            // clamp's `overflow: hidden` has nothing to clip.
            "relative whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground",
            !open && "line-clamp-3",
          )}
        >
          {text}
          {/* While expanded the box fits its content, so `overflowing` has
              gone false and the expanded flag is what keeps 收起 on screen. */}
          {(overflowing || open) && (
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="xs"
                className={cn(
                  !open
                    ? // Over the last line: the wide left padding is the room
                      // the fade needs to dissolve the clipped text, and the
                      // solid half of the gradient covers the ellipsis.
                      "absolute right-0 bottom-0 bg-gradient-to-l from-background via-background to-transparent pl-8"
                    : // Flows on after the last word, so the paragraph's own
                      // spacing rules apply to it like any other word.
                      "ml-1 px-0",
                )}
              >
                {open ? "收起" : "展开"}
              </Button>
            </CollapsibleTrigger>
          )}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
