import { useEffect } from "react";

/**
 * Page count for `total` items at `pageSize`, keeping at least one page so an
 * empty result still renders a coherent bar.
 *
 * Also pulls `page` back inside that bound: a background refetch can shrink the
 * list (and while the registry index streams in, pages past the loaded prefix
 * are beyond the end), which would otherwise strand the view on an empty page.
 */
export function useClampedPage(
  page: number,
  total: number,
  pageSize: number,
  setPage: (page: number) => void,
): number {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);

  return totalPages;
}
