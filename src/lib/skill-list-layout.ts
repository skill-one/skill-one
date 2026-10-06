
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
 * The compact square grid: one minimal card per skill. Narrower columns than
 * the store grid so more skills fit per screen; the tighter gap keeps the
 * grid dense without extra density controls.
 */
export const SKILL_GRID_LIST_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3";

/**
 * Placeholder standing in for one square while the grid loads: roughly the
 * height of a rendered square card, so the skeleton never changes size when
 * the real cards arrive.
 */
export const SKILL_GRID_SKELETON_CLASS = "aspect-square rounded-xl";

/**
 * The repository view: one full-width card per repository, stacked — every
 * card takes the whole row and splits its skills across two balanced columns
 * inside (see `RepoCard`), so one column is sized for a repository rather
 * than for a single skill. A stack, not a multi-column grid: the card's own
 * body is where the two columns live.
 */
export const REPO_LIST_CLASS = "flex flex-col gap-4";

/**
 * Placeholder standing in for one repository card while a list loads, at the
 * full width the real cards get. Measured off a rendered folded card showing
 * its five two-column rows (`RepoCard`'s FOLDED_ROWS) — the tallest a folded
 * card runs before its bar's toggle takes over.
 */
export const REPO_CARD_SKELETON_CLASS = "h-[200px] rounded-xl";
