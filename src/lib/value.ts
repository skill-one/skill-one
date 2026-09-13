/**
 * Tiny validators for the JSON the registry sources publish. Every field is
 * optional garnish, so a malformed value becomes `undefined` (or `null` for a
 * whole record) instead of throwing, and the same "non-empty or absent" rule
 * applies everywhere.
 */

/** A non-empty string; anything else is `undefined`. */
export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** An array whose every entry is a non-empty string; anything else is `undefined`. */
export function textList(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0)
    ? (value as string[])
    : undefined;
}

/** A finite number; anything else is `undefined`. */
export function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * A non-null, non-array JSON record, narrowed to `T`. Anything else is
 * `null` — the shape the candidate fetchers use for "unusable payload".
 */
export function record<T extends object>(value: unknown): T | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as T)
    : null;
}
