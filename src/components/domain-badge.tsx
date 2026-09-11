import { domainMeta } from "../data/domains";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * A skill's profile-domain chip: the canonical emoji (from the dataset's
 * fixed taxonomy) next to the domain name. Hovering answers the question a
 * reader actually has — *why is this skill in that category* — so the
 * per-skill `reason` is the tooltip content whenever the index carries
 * one; the taxonomy's scope description only stands in for skills that
 * lack a reason (or a reason for a name the taxonomy no longer knows).
 */
export function DomainBadge({
  domain,
  reason,
  className,
}: {
  domain: string;
  /** The generator's per-skill justification, if the index carries one. */
  reason?: string;
  className?: string;
}) {
  const meta = domainMeta(domain);
  const tooltip = reason
    ? `${meta ? `${meta.emoji} ` : ""}${reason}`
    : meta
      ? `${meta.emoji} ${meta.description}`
      : domain;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={className}>
            {meta && <span aria-hidden="true">{meta.emoji}</span>}
            {domain}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
