import { domainMeta } from "../data/domains";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * A skill's profile-domain chip: the canonical emoji (from the dataset's
 * fixed taxonomy) next to the domain name, hovering to explain what the
 * category covers. The per-skill `reason` (why the generator picked this
 * domain) is the fallback tooltip content for a name the taxonomy no longer
 * knows, and decorates the description otherwise.
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
  const tooltip = meta
    ? `${meta.emoji} ${meta.description}${reason ? ` —— ${reason}` : ""}`
    : (reason ?? domain);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn("cursor-help", className)}
          >
            {meta && <span aria-hidden="true">{meta.emoji}</span>}
            {domain}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
