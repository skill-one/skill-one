import { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  /** Secondary line; defaults to the generic "coming soon" hint. */
  description?: string;
  className?: string;
}

/** Placeholder for pages not yet implemented: shows an icon and a "coming soon" hint. */
export function PlaceholderPage({
  icon: Icon,
  title,
  description = "即将上线，敬请期待",
  className,
}: PlaceholderPageProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 px-8 pb-[12vh] text-muted-foreground",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground/40">
        <Icon className="h-8 w-8" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      <p className="text-[12px]">{description}</p>
    </div>
  );
}
