/**
 * One shared layout for every skill surface — the store list, the curated
 * sections, the leaderboards, a repository's skills and the installed list.
 *
 * All of them used to be a single full-width row per skill; they are now one
 * grid of shadcn Cards, which fits several skills per screen.
 *
 * The column count comes from the width the list actually has, not from the
 * window: the sidebar takes 13rem out of it, so viewport breakpoints would ask
 * for three columns in a 704px-wide area (~224px cards, titles truncated to
 * nothing) at exactly the app's default window size. `auto-fill` fills with as
 * many 280px columns as fit — 4 on a wide window, 3 at the app's default
 * 1280px window, 1 when the area is genuinely narrow — with no breakpoints to
 * keep in sync with the sidebar.
 */
export const SKILL_LIST_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4";

/**
 * Placeholder standing in for one card while a list loads: the height of the
 * card it replaces, so the skeleton never changes size when the real cards
 * arrive.
 *
 * Measured off a rendered store card at the app's default window and at the
 * grid's narrowest column (280px): 12px of card padding above, a 28px header
 * (the name's own line is shorter — the corner action beside it sets the row),
 * two 12px gaps, a 36px two-line description and a 43px rail. The description
 * is clamped and the rail's height is the same whether or not a classification
 * rides it, so one figure covers every store card. A skill with no source is a
 * few pixels shorter — its rail carries the 本地安装 label instead of a chip —
 * and the grid stretches its row to match its taller neighbours, which is the
 * case the skeleton is measuring.
 */
export const SKILL_CARD_SKELETON_CLASS = "h-[143px] rounded-xl";

/**
 * A collection page's list — a repository's own skills. One full-width row per
 * skill rather than the store's multi-column grid, so a long
 * list reads top to bottom and its ordinals form one column; the rows' gaps
 * match the grid's own 16px so the two surfaces feel the same rhythm.
 */
export const SKILL_ROW_LIST_CLASS = "flex flex-col gap-4";

/**
 * Placeholder standing in for one list row while a collection page loads: the
 * row's own height, so the skeleton never changes size when the real rows
 * arrive. Measured off a rendered row at the app's default window — 12px of
 * card padding above and below a 34px stack (a 14px name over a 12px
 * description).
 */
export const SKILL_ROW_SKELETON_CLASS = "h-[58px] rounded-xl";

/**
 * The store's repository view: one card per repository, so a lane is sized for
 * a repository rather than for a single skill. 440px is the narrowest lane that
 * still prints a skill's name, its one-line description and its install button
 * on one row — measured, not guessed: at 440px every row of `RepoCard` fits
 * without overflowing, and a long name truncates rather than pushing the
 * description out. Two 440px lanes plus their gap need 896px, and the page's
 * content is at most 1336px (1400 minus its own padding), so the repository
 * view is two lanes across the whole range the window can produce — one when
 * the window is narrow enough to fall under 896px.
 *
 * On a browser with CSS Grid Lanes (Safari 26.4+, and therefore the WKWebView
 * this app ships in) the same track definition becomes a masonry layout: every
 * card takes its own height — a one-skill repository measures 98px, a
 * repository at the largest preview cap 257px — instead of being stretched to
 * its neighbour. A
 * browser without it drops the unsupported `display` (the declaration sits
 * behind `@supports`, so the plain `grid` above still applies) and the row is
 * equal-height: the short card then wears its neighbour's height as space above
 * its footer, which `mt-auto` is what keeps at the bottom edge.
 */
export const REPO_LIST_CLASS =
  "grid gap-4 grid-cols-[repeat(auto-fill,minmax(440px,1fr))] supports-[display:grid-lanes]:[display:grid-lanes]";

/**
 * Placeholder standing in for one repository card while a list loads, at the
 * same lane width the real cards get. Measured off a rendered card at the
 * largest preview cap the settings popover offers (7 skills, 257px) — a grid row
 * is as tall as its tallest card, and the reader can raise the cap but not past
 * what the settings popover offers.
 */
export const REPO_CARD_SKELETON_CLASS = "h-[257px] rounded-xl";
