import { useEffect, useState } from "react";
import { FastAverageColor } from "fast-average-color";

import { useAgentIcon } from "./use-agent-icons";

/**
 * The agent-side color of one graph ribbon: the average color of the agent's
 * brand icon, computed at runtime with `fast-average-color` from the same
 * candidate URL `AgentIcon` paints. Monochrome glyphs, unresolved icons and
 * any load failure (offline, CORS) resolve to `undefined` — those ribbons
 * stay neutral instead of flashing a wrong color.
 *
 * Results are cached by artwork URL, so ribbons sharing an icon compute once;
 * like `FILE_TRAITS`, the color travels with the artwork, not the agent name.
 */
const edgeColorCache = new Map<string, string | undefined>();
const analyzer = new FastAverageColor();

export function useAgentEdgeColor(agentName: string): string | undefined {
  const { candidates, mono } = useAgentIcon(agentName);
  // Monochrome `currentColor` glyphs average to black — useless as an edge
  // color, so they skip the computation and stay neutral.
  const src = mono ? undefined : candidates[0];
  const [color, setColor] = useState<string | undefined>(() =>
    src ? edgeColorCache.get(src) : undefined,
  );

  useEffect(() => {
    if (!src) return;
    if (edgeColorCache.has(src)) {
      setColor(edgeColorCache.get(src));
      return;
    }
    let cancelled = false;
    analyzer
      .getColorAsync(src, { crossOrigin: "anonymous" })
      .then((result) => {
        if (cancelled) return;
        edgeColorCache.set(src, result.hex);
        setColor(result.hex);
      })
      .catch(() => {
        if (cancelled) return;
        edgeColorCache.set(src, undefined);
        setColor(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}
