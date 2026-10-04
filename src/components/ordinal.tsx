import { ordinalClass } from "../lib/ordinal";
import { cn } from "../lib/utils";

/**
 * One ordinal — where the entry stands in the list it is read in.
 *
 * The app prints this number in two shapes: the gutter of a skill row and the
 * head of a repository card's bar. They have to be *one* mark, because the shape
 * toggle offers the same list in either and a reader moving between them should
 * not find the numbering redrawn. So the box lives here once, and each surface
 * supplies only where it puts the number.
 *
 * The fixed width is the load-bearing part, twice over. It keeps every name in a
 * list starting at the same offset whether its number is one digit or four, and
 * it makes the numbers a column the eye can run down rather than a ragged edge —
 * the reason a list has them at all. 24px is also exactly what a card bar's owner
 * face occupies, so on a card the number and the face share one box and the
 * repository name lands on the same offset in every card, whether the card leads
 * with a face or, for the source-less pool, with a name.
 *
 * `ranked` is the caller's claim about the *list*, never about the number: a
 * ranked list medals its top three, an enumeration stays quiet. It defaults on,
 * because a surface that numbers its entries at all is ranking them — and the
 * surfaces that only enumerate opt out explicitly (the installed list's rows,
 * whose order is an install clock and a token cost rather than a figure the
 * reader compares). The point of the flag being per-surface rather than global is
 * that it must never be the *shape* that decides: a reader who toggles between a
 * row list and a card list is looking at one list, and a podium that vanished on
 * one of the two would be a mark that means nothing. See `lib/ordinal`.
 */
export function Ordinal({
  index,
  ranked = true,
  className,
}: {
  /** Zero-based position in the list; the number printed is `index + 1`. */
  index: number;
  /** Whether the list this ordinal belongs to carries a ranking. */
  ranked?: boolean;
  /** The surface's own placement — never the number's ink, which is
   *  `ordinalClass`'s to decide. */
  className?: string;
}) {
  return (
    <span
      className={cn(
        "w-6 shrink-0 text-center text-sm",
        ordinalClass(index, ranked),
        className,
      )}
    >
      {index + 1}
    </span>
  );
}
