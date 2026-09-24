import type { LucideIcon } from "lucide-react";

/**
 * The monochrome mark a skill wears in a list row's fixed glyph slot: the leading
 * domain's lucide icon, or the help icon when nothing classified it. The icon is
 * resolved by {@link domainIcon} at the call site and handed over as a prop, so
 * the component itself never creates one during render.
 */
export function DomainGlyph({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return <Icon aria-hidden className={className} />;
}
