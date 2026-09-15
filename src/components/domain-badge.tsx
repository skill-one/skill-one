import type { ComponentProps } from "react";

import { domainMeta } from "../data/domains";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * A skill's profile-domain chip: the canonical emoji (from the dataset's
 * fixed taxonomy) next to the domain name. Hovering answers the question a
 * reader actually has — *why is this skill in that category* — so the
 * per-skill `reason` is the tooltip content whenever the index carries
 * one; the taxonomy's scope description only stands in for skills that
 * lack a reason (or a reason for a name the taxonomy no longer knows).
 *
 * `variant` is the one thing the two surfaces disagree about: a list card's
 * rail is a line of facts, so it wears the chip flattened to plain text
 * (`ghost` plus a caller-supplied `px-0 py-0`), while the detail panel states
 * the classification among its other badges and keeps the outline border. The
 * emoji, the name and the tooltip are the same either way — only the chrome
 * differs.
 */
export function DomainBadge({
  domain,
  reason,
  className,
  variant = "outline",
}: {
  domain: string;
  /** The generator's per-skill justification, if the index carries one. */
  reason?: string;
  className?: string;
  /** Badge chrome; `outline` by default, `ghost` for a flattened rail. */
  variant?: ComponentProps<typeof Badge>["variant"];
}) {
  const meta = domainMeta(domain);
  const tooltip = reason
    ? `${meta ? `${meta.emoji} ` : ""}${reason}`
    : meta
      ? `${meta.emoji} ${meta.description}`
      : domain;
  return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant={variant} className={className}>
              {meta && <span aria-hidden="true">{meta.emoji}</span>}
              {domain}
            </Badge>
          }
        />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
  );
}
