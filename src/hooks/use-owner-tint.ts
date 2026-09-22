import { useEffect, useSyncExternalStore } from "react";

import {
  ensureOwnerTint,
  getOwnerTint,
  subscribeOwnerTints,
} from "../lib/owner-tint";

/**
 * The colour read off an owner's avatar, or null — which is what a card gets
 * first, and what it keeps when there is no colour to be had.
 *
 * The snapshot is the store's own value, so a tint that arrives late re-renders
 * the cards that asked for that owner and nothing else; the read itself is
 * asked for once per owner, from an effect, so rendering stays free of work
 * that has nothing to do with the pixels on screen.
 */
export function useOwnerTint(owner?: string): string | null {
  const tint = useSyncExternalStore(subscribeOwnerTints, () =>
    owner ? getOwnerTint(owner) : null,
  );

  useEffect(() => {
    if (owner) ensureOwnerTint(owner);
  }, [owner]);

  return tint;
}
