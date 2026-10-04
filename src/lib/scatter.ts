import type { CSSProperties } from "react";

/**
 * The installed list's scattered-desk look: every repository card sits in its
 * own grid slot (so the layout engine still guarantees no overlap and a sane
 * responsive flow) but wears a small, seeded rotation and offset, so the grid
 * reads as cards laid down by hand rather than stamped by a machine.
 *
 * The jitter is **deterministic** — derived from a hash of the card's seed, not
 * from `Math.random()` — so a card keeps its pose across re-renders, searches,
 * and restarts: nothing on the desk ever moves by itself. It is also **small**
 * (±2°, ±5px): past that range a card's lifted corner starts to collide with
 * the 16px grid gap and text legibility suffers, and the effect flips from
 * "casual" to "broken".
 */
export interface Scatter {
  /** Clockwise tilt in degrees, within ±`SCATTER_MAX_DEGREES`. */
  rotate: number;
  /** Horizontal nudge in px, within ±`SCATTER_MAX_OFFSET`. */
  x: number;
  /** Vertical nudge in px, within ±`SCATTER_MAX_OFFSET`. */
  y: number;
}

/** The widest tilt a scattered card may take. */
export const SCATTER_MAX_DEGREES = 2;

/** The farthest a scattered card may nudge, per axis. */
export const SCATTER_MAX_OFFSET = 5;

/**
 * FNV-1a over `seed` salted with `salt`, as an unsigned 32-bit figure. One
 * hash per axis (the salt keeps the three from correlating) is enough spread
 * for a desk of a few dozen cards.
 */
function hash32(seed: string, salt: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ (seed.charCodeAt(i) ^ salt.charCodeAt(i % salt.length)), 0x01000193);
  }
  return h >>> 0;
}

/** Maps a 32-bit hash onto [0, span). */
function spread(hash: number, span: number): number {
  return (hash / 0x1_0000_0000) * span;
}

/**
 * The pose a card seeded by `seed` takes — the same seed always answers the
 * same pose, which is what keeps the desk still.
 */
export function scatterOf(seed: string): Scatter {
  return {
    rotate:
      spread(hash32(seed, "rotate"), SCATTER_MAX_DEGREES * 2) -
      SCATTER_MAX_DEGREES,
    x: spread(hash32(seed, "x"), SCATTER_MAX_OFFSET * 2) - SCATTER_MAX_OFFSET,
    y: spread(hash32(seed, "y"), SCATTER_MAX_OFFSET * 2) - SCATTER_MAX_OFFSET,
  };
}

/**
 * A seeded figure in [0, 1) — the same seed always answers the same value.
 * Layouts that need more spread than a `Scatter` carries (the jar's spawn
 * columns, say) scale it themselves instead of each growing a private hash.
 */
export function unitOf(seed: string): number {
  return hash32(seed, "unit") / 0x1_0000_0000;
}

/**
 * The pose as inline custom properties, read by `SCATTERED_CARD_CLASS` — the
 * transform itself stays in CSS so hover and focus can straighten the card
 * with a plain `transform: none` instead of reconciling inline styles.
 */
export function scatterStyle({ rotate, x, y }: Scatter): CSSProperties {
  return {
    "--scatter-rotate": `${rotate}deg`,
    "--scatter-x": `${x}px`,
    "--scatter-y": `${y}px`,
  } as CSSProperties;
}

/**
 * How a scattered card sits and behaves. The tilt is its resting state; on
 * hover — or when focus lands inside it, for keyboard readers — it straightens
 * and levels with the grid, the micro-interaction that makes the scatter read
 * as deliberate. Reduced-motion readers keep the static pose (a still tilt is
 * not motion) but lose the straighten transition.
 */
export const SCATTERED_CARD_CLASS =
  "transition-transform duration-200 motion-reduce:transition-none [transform:rotate(var(--scatter-rotate))_translate(var(--scatter-x),var(--scatter-y))] hover:[transform:none] focus-within:[transform:none]";
