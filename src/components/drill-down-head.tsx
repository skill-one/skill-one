import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";

import { useReturn } from "../hooks/use-return";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * A page inside a list, as its own head: the way back to the list, the thing
 * the page is about, the figures it states about it, and the one action the
 * reader can take on it.
 *
 * Every drill-down in the app hangs off a list — a repository's page off the
 * store's or the installed list's, the local pool off the installed list — and
 * every one of them opens with the same three questions: which thing is this,
 * how big is it, and how do I get back. They are one row because they are one
 * subject. The way back used to live up in the window's chrome, on the argument
 * that one control in one place serves every drill-down (see `AppHeader`); it
 * lives here instead because the page it leaves is where the rest of that
 * subject is said, and a reader who wants out of a repository looks at the
 * repository, not at the title bar above it. The rail still says which list the
 * page belongs to — it lights that list up for the whole time the page is
 * mounted — so the control names no destination, and it does not print the word
 * 返回 beside the mark either: on a row whose other half is a name the reader
 * is trying to read, a word whose meaning they can already see is noise. The
 * word moves to where a mark that cannot say it itself says it — the control's
 * accessible name and its hover tip — which is the arrangement the list's own
 * tools use for the same reason (see `ListUnitToggle`).
 *
 * The row reads left to right the way the list below it is read: the control
 * that goes back, then the entity's face, then what it is called over the
 * figures that characterise it, and — at the far end — the page's one action.
 * What the pages do not share is what each slot holds. A repository has an
 * owner to draw a face for and a GitHub page to open; the local pool has
 * neither, so `avatar` and `action` are optional and the row keeps the same
 * shape with them empty. What they do share is the geometry: the figures always
 * ride the name in the same muted ink, and the row always sits above the scroll
 * container rather than inside it, so a list that scrolls away leaves its
 * subject and its way out on screen.
 *
 * `back` is the list this page hangs off, and it is used only for the case the
 * control cannot decide on its own: nothing behind this entry to pop — a cold
 * start on a deep link, or the menu bar's popover. See `useReturn`.
 */
export function DrillDownHead({
  back,
  avatar,
  title,
  titleAction,
  meta,
  action,
}: {
  /** The list this page hangs off; where the control leads with nothing behind. */
  back: string;
  /** The entity's face, when it has one; absent leaves the slot empty. */
  avatar?: ReactNode;
  /** What the page is about — the entity's own name, and the page's `h1`. */
  title: string;
  /** A small control that belongs to the name itself — a mark beside it, not
   * a row of its own. It sits outside the `h1`, so the heading keeps the
   * entity's name as its whole accessible name. */
  titleAction?: ReactNode;
  /** The figures the page states about the entity, in the name's own column. */
  meta: ReactNode;
  /** The page's one action, at the trailing edge; absent leaves the slot empty. */
  action?: ReactNode;
}) {
  const wayBack = useReturn(back);

  return (
    <div className="mb-4 flex min-w-0 items-center gap-3">
      {/* The mark alone, in a square the size the app's other icon-only
          controls wear (see `SkillInstallButton`). The mark is a chevron, not a
          full arrow, for two reasons that are both about this row: the reader
          got here by pressing a card's `›` door (see `RepoCard`), so `‹` is the
          inverse of the exact mark that brought them — go in with one, come out
          with the other — and a chevron carries less ink than an arrow in the
          same box, which is what keeps an icon this size from reading heavier
          than the 18px name it stands beside. It is a plain `<Link>` so a
          modified click, or assistive tech reading it, gets the destination the
          fallback names — the hook only intercepts the plain clicks it is for —
          and `aria-label` is what keeps the word 返回 attached to it, the tip
          being where a pointer finds it. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to={wayBack.to}
              onClick={wayBack.onClick}
              aria-label="返回"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          }
        >
          <ChevronLeft className="h-4.5 w-4.5" aria-hidden />
        </TooltipTrigger>
        {/* Below the control: it opens the page, on the first row the content
            has, so the tip has nowhere to go but down. */}
        <TooltipContent side="bottom">返回</TooltipContent>
      </Tooltip>

      {avatar}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {title}
          </h1>
          {titleAction}
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums">
          {meta}
        </p>
      </div>

      {action}
    </div>
  );
}
