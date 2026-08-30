import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

import { cn } from "../../../lib/utils";
import type { HeroSlide } from "./featured-rankings";

/** Where a hero slide click lands: the full, sortable registry list. */
const EXPLORE_PATH = "/explore";

/** Delay between automatic slide advances. */
const AUTOPLAY_DELAY_MS = 5000;

/**
 * The featured page's hero banner: a looping, auto-playing carousel of
 * computed leaderboard slides. Each slide is fully clickable and opens the
 * explore page; side arrows and bottom dots give manual control, and
 * hovering the banner pauses the autoplay.
 *
 * Renders nothing when there are no slides (e.g. an index without any
 * qualifying install data).
 */
export function FeaturedHero({ slides }: { slides: HeroSlide[] }) {
  const navigate = useNavigate();
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: slides.length > 1 },
    [
      Autoplay({
        delay: AUTOPLAY_DELAY_MS,
        stopOnMouseEnter: true,
        stopOnInteraction: false,
      }),
    ],
  );
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  if (slides.length === 0) return null;

  return (
    <section aria-label="精选推荐" className="relative">
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {slides.map((slide) => (
            <div
              key={slide.id}
              className="min-w-0 flex-[0_0_100%]"
              role="group"
              aria-roledescription="幻灯片"
            >
              <button
                type="button"
                onClick={() => navigate(EXPLORE_PATH)}
                aria-label={`${slide.title}，查看完整榜单`}
                className={cn(
                  "relative block h-56 w-full cursor-pointer text-left",
                  slide.gradient,
                )}
              >
                <span className="flex h-full items-center justify-between gap-6 px-10">
                  <span className="flex max-w-[55%] flex-col gap-2">
                    <span className="text-2xl font-bold tracking-tight text-white">
                      {slide.title}
                    </span>
                    <span className="text-sm leading-relaxed text-white/85">
                      {slide.subtitle}
                    </span>
                  </span>
                  <span className="hidden shrink-0 flex-col gap-1.5 sm:flex">
                    {slide.entries.map((entry) => (
                      <span
                        key={`${entry.skill.repo}/${entry.skill.name}`}
                        className="flex items-center gap-3 text-sm text-white"
                      >
                        <span className="w-4 text-right font-bold tabular-nums text-white/70">
                          {entry.rank}
                        </span>
                        <span className="w-44 truncate font-medium">
                          {entry.skill.name}
                        </span>
                        <span className="tabular-nums text-white/80">
                          {entry.label}
                        </span>
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/25 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/25 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`第 ${i + 1} 张：${slide.title}`}
                onClick={() => emblaApi?.scrollTo(i)}
                className={cn(
                  "h-1.5 cursor-pointer rounded-full transition-all",
                  i === selected ? "w-5 bg-white" : "w-1.5 bg-white/50",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
