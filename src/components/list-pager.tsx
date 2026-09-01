import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "./ui/pagination";
import { pageRange } from "../lib/pagination";

/**
 * The list pages' shared pagination row: previous / numbered pages (with
 * ellipsis) / next — the current page number doubles as an editable jump box
 * — with the item count pinned to the right. The controls stay visible even
 * on a single page (both ends clamped), so the count row always keeps its
 * pagination context. Absolute positioning keeps the pager centered
 * regardless of how wide the count or the page window gets.
 */
export function ListPager({
  page,
  totalPages,
  onPage,
  count,
}: {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  /** Commit a new page (clamped to range by the caller or here). */
  onPage: (page: number) => void;
  /** Right-aligned count text, e.g. "共 24 个". */
  count: string;
}) {
  // The current page number renders as an editable box: typing a number there
  // and committing (Enter or blur) jumps straight to that page, clamped to
  // [1, totalPages]; Escape (or an empty value) keeps the current page.
  // `draft` holds the value being typed; null shows the committed page number.
  const [draft, setDraft] = useState<string | null>(null);
  const commitDraft = (value: string) => {
    setDraft(null);
    const n = Math.floor(Number(value));
    if (value.trim() === "" || !Number.isFinite(n)) return;
    onPage(Math.min(totalPages, Math.max(1, n)));
  };
  // Escape discards the draft, but the blur it triggers would otherwise
  // commit the just-discarded value — suppress that one commit.
  const escapeReverted = useRef(false);

  // Anchor-based pagination controls have no `disabled` attribute, so guard
  // against navigating past the first/last page here.
  const goPrev = () => {
    if (page > 1) onPage(page - 1);
  };
  const goNext = () => {
    if (page < totalPages) onPage(page + 1);
  };

  const range = pageRange(page, totalPages);

  return (
    <div className="relative flex min-h-14 items-center justify-center border-t border-border px-4 py-3">
      <Pagination className="w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationLink
              size="icon"
              href="#"
              aria-label="上一页"
              aria-disabled={page <= 1}
              className={cn(
                "h-8 w-8",
                page <= 1 && "pointer-events-none opacity-50",
              )}
              onClick={(e) => {
                e.preventDefault();
                goPrev();
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </PaginationLink>
          </PaginationItem>
          {range.map((p, i) =>
            p === "..." ? (
              <PaginationItem key={`ellipsis-${i}`}>
                <PaginationEllipsis className="h-8 w-8" />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                {p === page ? (
                  <Input
                    value={draft ?? String(page)}
                    onChange={(e) =>
                      setDraft(e.target.value.replace(/\D/g, ""))
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      if (escapeReverted.current) {
                        escapeReverted.current = false;
                        return;
                      }
                      commitDraft(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        escapeReverted.current = true;
                        setDraft(null);
                        e.currentTarget.blur();
                      }
                    }}
                    inputMode="numeric"
                    aria-label="跳转到第几页"
                    className="h-8 px-1.5 text-center tabular-nums"
                    style={{
                      width: `max(2rem, ${
                        (draft ?? String(page)).length
                      }ch + 0.75rem)`,
                    }}
                  />
                ) : (
                  <PaginationLink
                    size="icon"
                    href="#"
                    className="h-8 w-8"
                    isActive={p === page}
                    onClick={(e) => {
                      e.preventDefault();
                      onPage(p);
                    }}
                  >
                    {p}
                  </PaginationLink>
                )}
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationLink
              size="icon"
              href="#"
              aria-label="下一页"
              aria-disabled={page >= totalPages}
              className={cn(
                "h-8 w-8",
                page >= totalPages && "pointer-events-none opacity-50",
              )}
              onClick={(e) => {
                e.preventDefault();
                goNext();
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <span className="absolute right-4 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}
