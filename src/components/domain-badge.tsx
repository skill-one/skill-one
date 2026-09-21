import type { ComponentProps } from "react";

import { domainLabel, domainMeta } from "../data/domains";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * A skill's profile-domain chip: the canonical emoji next to the domain's
 * label. Hovering answers the question a reader actually has — *why is this
 * skill in that category* — so the per-skill `reason` is the tooltip content
 * whenever the index carries one; the taxonomy's scope description only
 * stands in for skills that lack a reason (or a reason for a key the taxonomy
 * no longer knows).
 *
 * A skill may be classified under several domains, best fit first: the chip
 * shows the leading one and the tooltip names the rest, so the rail stays one
 * compact fact while nothing is hidden.
 *
 * `variant` is the one thing the two surfaces disagree about: a list card's
 * rail is a line of facts, so it wears the chip flattened to plain text
 * (`ghost` plus a caller-supplied `px-0 py-0`), while the detail panel states
 * the classification among its other badges and keeps the outline border. The
 * emoji, the label and the tooltip are the same either way — only the chrome
 * differs.
 */
export function DomainBadge({
  domain,
  reason,
  className,
  variant = "outline",
}: {
  /** The classification, best fit first. Empty renders nothing. */
  domain: string[];
  /** The generator's per-skill justification, if the index carries one. */
  reason?: string;
  className?: string;
  /** Badge chrome; `outline` by default, `ghost` for a flattened rail. */
  variant?: ComponentProps<typeof Badge>["variant"];
}) {
  const key = domain[0];
  if (!key) return null;
  const meta = domainMeta(key);
  const label = domainLabel(key);
  const others = domain.slice(1).map(domainLabel);
  const base = reason
    ? `${meta ? `${meta.emoji} ` : ""}${reason}`
    : meta
      ? `${meta.emoji} ${meta.description}`
      : label;
  const tooltip =
    others.length > 0 ? `${base}（同时属于：${others.join("、")}）` : base;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant={variant} className={className}>
            {meta && <span aria-hidden="true">{meta.emoji}</span>}
            {label}
          </Badge>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
