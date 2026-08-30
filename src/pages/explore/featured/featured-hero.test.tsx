import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithRouter, screen, waitFor } from "../../../test/test-utils";
import type { Skill } from "../../../types/skill";
import { FeaturedHero } from "./featured-hero";
import type { HeroSlide } from "./featured-rankings";

/**
 * Embla needs real layout to compute snap points, which jsdom never has, so
 * the hook is replaced with a controllable fake: rendering still happens
 * (slides, arrows, dots) while scroll calls land on this shared api object.
 */
const emblaApi = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  selectedScrollSnap: vi.fn(() => 0),
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  scrollTo: vi.fn(),
}));

const useEmblaCarousel = vi.hoisted(() => vi.fn());

vi.mock("embla-carousel-react", () => ({
  default: useEmblaCarousel,
}));

useEmblaCarousel.mockReturnValue([vi.fn(), emblaApi]);

function skill(name: string, over: Partial<Skill> = {}): Skill {
  return {
    name,
    repo: `acme/${name}`,
    description: "",
    stars: 1,
    downloads: 1_000,
    ...over,
  };
}

const slides: HeroSlide[] = [
  {
    id: "weekly",
    title: "Skill 周榜",
    subtitle: "每周精选热门 Skill，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-violet-500 to-cyan-400",
    entries: [
      { rank: 1, skill: skill("alpha", { weeklyInstalls: 1_200 }), label: "1.2K/周" },
      { rank: 2, skill: skill("beta", { weeklyInstalls: 300 }), label: "300/周" },
    ],
  },
  {
    id: "popular",
    title: "人气总榜",
    subtitle: "安装量最高的经典 Skill，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-amber-400 to-rose-500",
    entries: [{ rank: 1, skill: skill("gamma"), label: "1K" }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  emblaApi.selectedScrollSnap.mockReturnValue(0);
});

describe("FeaturedHero", () => {
  it("renders every slide with its leaderboard entries", () => {
    renderWithRouter(<FeaturedHero slides={slides} />);

    expect(screen.getByText("Skill 周榜")).toBeInTheDocument();
    expect(
      screen.getByText("每周精选热门 Skill，点击查看完整榜单"),
    ).toBeInTheDocument();
    // The ranked list shows rank, name and the preformatted metric.
    expect(screen.getByText("alpha", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("1.2K/周")).toBeInTheDocument();
    expect(screen.getByText("300/周")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "span" })).toBeInTheDocument();
  });

  it("configures embla with looping and the autoplay plugin for multiple slides", () => {
    renderWithRouter(<FeaturedHero slides={slides} />);

    expect(useEmblaCarousel).toHaveBeenCalledWith(
      { loop: true },
      [expect.anything()],
    );
    // The selected-slide listener keeps the dots in sync.
    expect(emblaApi.on).toHaveBeenCalledWith("select", expect.any(Function));
  });

  it("offers one dot per slide and scrolls on dot click", async () => {
    const user = userEvent.setup();
    renderWithRouter(<FeaturedHero slides={slides} />);

    expect(
      screen.getByRole("button", { name: "第 1 张：Skill 周榜" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "第 2 张：人气总榜" }),
    );
    expect(emblaApi.scrollTo).toHaveBeenCalledWith(1);
  });

  it("scrolls via the side arrows", async () => {
    const user = userEvent.setup();
    renderWithRouter(<FeaturedHero slides={slides} />);

    await user.click(screen.getByRole("button", { name: "上一张" }));
    await user.click(screen.getByRole("button", { name: "下一张" }));
    expect(emblaApi.scrollPrev).toHaveBeenCalledTimes(1);
    expect(emblaApi.scrollNext).toHaveBeenCalledTimes(1);
  });

  it("opens the explore page when a slide is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route
          path="/explore/featured"
          element={<FeaturedHero slides={slides} />}
        />
        <Route path="/explore" element={<div>full registry list</div>} />
      </Routes>,
      { route: "/explore/featured" },
    );

    await user.click(
      screen.getByRole("button", { name: "Skill 周榜，查看完整榜单" }),
    );

    await waitFor(() =>
      expect(screen.getByText("full registry list")).toBeInTheDocument(),
    );
  });

  it("hides the controls for a single slide", () => {
    renderWithRouter(<FeaturedHero slides={[slides[0]]} />);

    expect(
      screen.queryByRole("button", { name: "上一张" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一张" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /第 1 张/ }),
    ).not.toBeInTheDocument();
    // Looping is pointless with a single slide.
    expect(useEmblaCarousel).toHaveBeenCalledWith({ loop: false }, [
      expect.anything(),
    ]);
  });

  it("renders nothing without slides", () => {
    const { container } = renderWithRouter(<FeaturedHero slides={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
