import { avatarCandidates } from "./avatar-source";
import { fetchSignal } from "./cdn-config";

/**
 * One owner's colour, read off their avatar: the average of the picture, held
 * per owner for the life of the window.
 *
 * This is decoration, and it is built as decoration at every step:
 *
 * - **It never blocks.** The read is scheduled on idle, so a card paints its
 *   full, neutral chrome immediately and gains a tint only if a colour actually
 *   arrives — never the other way round, and never with a placeholder colour in
 *   between.
 * - **It fails quietly.** No decoding APIs (a test environment), no source
 *   reachable, an undecodable or fully transparent file: the answer is "no
 *   colour", and the card renders exactly as it did before any of this existed.
 *   An owner is read once per session either way — a viewer scrolling past forty
 *   cards of the same ten owners must not re-ask for a colour that already
 *   failed once.
 * - **It caches the colour, not the pixels.** What is kept is the one hex value
 *   the CSS mixes with, so a card scrolled back into view costs nothing.
 *
 * The picture is fetched as bytes rather than read off the `<img>` the card
 * draws: a canvas is tainted by a cross-origin image unless the image was
 * requested with `crossOrigin` and every source answered with CORS headers —
 * adding that attribute to the visible avatar would put the *picture* at risk to
 * obtain a colour. Bytes fetched here become a same-origin blob, and a blob is
 * never tainted. The URL is the same one the image is loading, so in practice
 * this second read is served from the HTTP cache.
 */

/** The square the avatar is decoded to before it is averaged. */
const SAMPLE_PX = 16;

/** Owners already read, whether or not they answered with a colour. */
const tried = new Set<string>();
/** Owners that answered, by hex. */
const tints = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  // Snapshot the Set: a listener that unsubscribes must not disturb this walk.
  // eslint-disable-next-line unicorn/no-useless-spread
  for (const listener of [...listeners]) listener();
}

/** The tint recorded for an owner; null while there is none. */
export function getOwnerTint(owner: string): string | null {
  return tints.get(owner) ?? null;
}

/** Subscribe to arriving tints; returns an unsubscribe function. */
export function subscribeOwnerTints(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ask for an owner's tint. Idempotent per owner and cheap to call on every
 * render: the second call for an owner does nothing at all.
 */
export function ensureOwnerTint(owner: string): void {
  if (!owner || tried.has(owner)) return;
  tried.add(owner);
  const read = () => {
    void readOwnerTint(owner).then((hex) => {
      if (hex === null) return;
      tints.set(owner, hex);
      emit();
    });
  };
  // Idle where the platform offers it: forty cards asking at once must not
  // compete with the paint that is about to show them.
  if (typeof requestIdleCallback === "function") requestIdleCallback(read);
  else setTimeout(read, 0);
}

/**
 * The average colour of an owner's avatar, or null when no source could be read
 * to the end. Exported for its own test: everything above is bookkeeping.
 */
export async function readOwnerTint(owner: string): Promise<string | null> {
  // Without the decoding APIs there are no pixels to average — the shape of a
  // test environment (jsdom) and of a WebView older than the app's floor.
  if (typeof createImageBitmap !== "function") return null;
  // Lazily imported: a decoration nobody may see does not belong in the shell's
  // first chunk.
  const { FastAverageColor } = await import("fast-average-color");
  for (const url of avatarCandidates(owner)) {
    try {
      const resp = await fetch(url, { signal: fetchSignal() });
      if (!resp.ok) continue;
      const bitmap = await createImageBitmap(await resp.blob(), {
        resizeWidth: SAMPLE_PX,
        resizeHeight: SAMPLE_PX,
      });
      try {
        const { hex } = await new FastAverageColor().getColorAsync(bitmap, {
          mode: "speed",
        });
        return hex;
      } finally {
        bitmap.close();
      }
    } catch {
      // Unreachable, timed out, undecodable: give the next source its turn.
    }
  }
  return null;
}

/** Test hook: forget every owner, so one case cannot colour the next. */
export function resetOwnerTints(): void {
  tried.clear();
  tints.clear();
  listeners.clear();
}
