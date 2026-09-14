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
 * Measured off a rendered store card at the app's default window: 32px of
 * card padding, a 48px header (the 40px cover row plus the header grid's own
 * row gap), 12px gaps, a 40px description, an 18px footer and the 2px border.
 */
export const SKILL_CARD_SKELETON_CLASS = "h-[164px] rounded-xl";
