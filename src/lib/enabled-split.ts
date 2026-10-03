/**
 * The one invariant the installed list's order carries on top of whatever the
 * reader picked: a disabled install is parked, not competing.
 *
 * A sort answers *which of the live skills reads first*. Enablement answers a
 * different question — whether the skill takes part at all — so it is not a
 * fourth order to choose from but a partition of whichever order was chosen.
 * That is why this is a split rather than a comparator: the list sorts once with
 * its own comparator, then this runs over the result, and the two halves each
 * keep the order they arrived in. Every sort the list offers therefore sinks the
 * disabled installs for free, and a sort added later inherits the behaviour
 * instead of having to remember to opt in.
 *
 * The alternative — folding the flag into each comparator — makes the invariant
 * a property of every comparator, so it holds only for the orders somebody
 * remembered to wrap. One pass here holds it for all of them, including the ones
 * that do not exist yet.
 */

/** One list split into the two halves that render as two groups. */
export interface EnabledSplit<T> {
  /** The rows taking part, in the order they arrived in. */
  enabled: T[];
  /** The parked rows, in the order they arrived in. */
  disabled: T[];
}

/**
 * Split a list into its enabled and disabled halves in one pass, each half
 * keeping the relative order of the input.
 *
 * Stable by construction: rows are appended to the half they belong to in
 * encounter order, so a list that was already sorted stays sorted inside both
 * halves. That is the whole contract — the caller sorts, this only separates.
 *
 * `isEnabled` is asked once per row. An empty input yields two empty halves, so
 * a caller can render the enabled group unconditionally and treat an empty
 * disabled half as "no section to draw".
 */
export function splitByEnabled<T>(
  rows: readonly T[],
  isEnabled: (row: T) => boolean,
): EnabledSplit<T> {
  const enabled: T[] = [];
  const disabled: T[] = [];
  for (const row of rows) {
    if (isEnabled(row)) enabled.push(row);
    else disabled.push(row);
  }
  return { enabled, disabled };
}
