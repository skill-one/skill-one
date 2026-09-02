import { Skeleton } from "./ui/skeleton";

/**
 * A run of identical placeholder rows, matching the rhythm of the list that
 * replaces it. `listClassName` is the loaded list's own container class and
 * `itemClassName` the row box it collapses to, so each page keeps its layout.
 */
export function SkeletonList({
  rows,
  listClassName,
  itemClassName,
}: {
  rows: number;
  listClassName: string;
  itemClassName: string;
}) {
  return (
    <div className={listClassName} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={itemClassName} />
      ))}
    </div>
  );
}
