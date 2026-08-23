import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillsPage } from "../lib/skills-api";
import { fetchSkillDetail } from "../lib/skill-detail-api";
import { ExplorePage } from "./explore-page";

vi.mock("../lib/skills-api", () => ({ fetchSkillsPage: vi.fn() }));
vi.mock("../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

const mockFetchSkillsPage = vi.mocked(fetchSkillsPage);
const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

// The IntersectionObserver mock defined in test/setup.ts exposes its
// instances so tests can fire intersection callbacks manually. Each render
// cycle may create a new observer, so tests always trigger the latest one.
const ioMock = globalThis.IntersectionObserver as unknown as {
  instances: Array<{ trigger: (intersecting?: boolean) => void }>;
};

/** Build a raw skills.sh page of `count` skills, offset for key uniqueness. */
function makeSkills(count: number, offset: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${offset + i}`,
    repo: `repo-${offset + i}/skills`,
    description: "",
    stars: 1000,
  }));
}

/** A full raw page (200 skills) with a successor — the realistic case. */
const page0 = { skills: makeSkills(200, 0), hasMore: true, total: 400 };
const page1 = { skills: makeSkills(200, 200), hasMore: false, total: 400 };
/** A page with no successor — used to verify fetching stops. */
const lastPage = { skills: makeSkills(200, 0), hasMore: false, total: 200 };

let queryClient: QueryClient;

function renderExplorePage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ExplorePage />
    </QueryClientProvider>,
  );
}

/** Fire the sentinel intersection callback on the newest observer instance. */
async function fireSentinel() {
  await act(async () => {
    ioMock.instances[ioMock.instances.length - 1].trigger(true);
  });
}

beforeEach(() => {
  // Fresh cache per test; retries are off so a rejected fetch surfaces an
  // error state immediately instead of being retried silently.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10 * 60 * 1000, retry: false } },
  });
  mockFetchSkillsPage.mockReset();
  // The detail sheet resolves instantly for any skill in these tests.
  mockFetchSkillDetail.mockReset();
  mockFetchSkillDetail.mockImplementation(async (_repo: string, id: string) => ({
    name: id,
    description: `Description of ${id}.`,
    instructions: `Instructions for ${id}.`,
    path: `skills/${id}/SKILL.md`,
  }));
});

afterEach(() => {
  ioMock.instances.length = 0;
});

describe("ExplorePage", () => {
  it("loads the first raw page but only renders the first 30 skills", async () => {
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();

    // The 200 fetched skills are sliced to RENDER_CHUNK (30) on mount, so
    // skill-30 must not be mounted yet even though it is already in memory.
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-29")).toBeInTheDocument();
    expect(screen.queryByText("skill-30")).not.toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);
    expect(mockFetchSkillsPage).toHaveBeenCalledWith(0);

    // The header hint shows the registry-wide total reported by the page.
    expect(screen.getByText(/共 400 个技能/)).toBeInTheDocument();
  });

  it("renders the next batch when the sentinel fires without refetching", async () => {
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();
    await screen.findByText("skill-0");
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);

    await fireSentinel();
    expect(await screen.findByText("skill-30")).toBeInTheDocument();
    expect(screen.queryByText("skill-60")).not.toBeInTheDocument();
    // 170 skills remain unrendered in the cache, so no network call happens.
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);
  });

  it("fetches the next raw page only after everything rendered so far is on screen", async () => {
    mockFetchSkillsPage.mockResolvedValueOnce(page0).mockResolvedValueOnce(page1);
    renderExplorePage();
    await screen.findByText("skill-0");
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);

    // Five more sentinel fires reveal batches up to 180 (skills 0-179); the
    // sixth reaches 200, covering everything fetched so far.
    for (let i = 0; i < 5; i++) {
      await fireSentinel();
    }
    expect(await screen.findByText("skill-179")).toBeInTheDocument();
    expect(screen.queryByText("skill-180")).not.toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);

    await fireSentinel();
    await waitFor(() => expect(mockFetchSkillsPage).toHaveBeenCalledTimes(2));
    expect(mockFetchSkillsPage).toHaveBeenLastCalledWith(1);
    await screen.findByText("skill-199");

    // page1 (400 skills) is now in memory but visibleCount is still 200, so
    // skill-200 is not mounted; one more fire reveals the next batch.
    await fireSentinel();
    expect(await screen.findByText("skill-200")).toBeInTheDocument();
    expect(screen.queryByText("skill-230")).not.toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(2);
  });

  it("does not fetch again once hasMore is false", async () => {
    mockFetchSkillsPage.mockResolvedValueOnce(lastPage);
    renderExplorePage();
    await screen.findByText("skill-0");
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);

    // Seven fires render all 200 skills; hasMore is false, so no raw page is
    // ever requested again.
    for (let i = 0; i < 7; i++) {
      await fireSentinel();
    }
    expect(await screen.findByText("skill-199")).toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);
  });

  it("reuses the query cache on remount without re-requesting", async () => {
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    const { unmount } = renderExplorePage();
    await screen.findByText("skill-0");
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);
    unmount();

    // The 10-minute freshness window keeps the cached query fresh: remounting
    // within it renders from cache with zero network calls.
    mockFetchSkillsPage.mockClear();
    renderExplorePage();
    await screen.findByText("skill-0");
    expect(mockFetchSkillsPage).not.toHaveBeenCalled();
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    mockFetchSkillsPage.mockRejectedValueOnce(new Error("network error"));
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();

    expect(
      await screen.findByText("加载失败：network error"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
  });

  it("switches between source tabs", async () => {
    const user = userEvent.setup();
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();

    await user.click(screen.getByRole("tab", { name: "Git 仓库" }));
    expect(
      screen.getByText("通过 Git 仓库添加技能 — 即将上线"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "本地目录" }));
    expect(
      screen.getByText("从本地目录扫描技能 — 即将上线"),
    ).toBeInTheDocument();
  });

  it("opens the detail panel when a card is clicked", async () => {
    const user = userEvent.setup();
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByText("skill-0"));

    // Await the async detail content first; the rest renders with it.
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("skill-0")).toBeInTheDocument();
    expect(within(panel).getByText("repo-0/skills")).toBeInTheDocument();
  });

  it("switches skills inside the panel via card clicks", async () => {
    const user = userEvent.setup();
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByText("Instructions for skill-0.")).toBeInTheDocument();

    // Clicking another card while the panel is open swaps the skill in place.
    await user.click(screen.getByText("skill-29"));
    expect(
      await screen.findByText("Instructions for skill-29."),
    ).toBeInTheDocument();
  });

  it("scrolls the card into view when the panel opens, but not when switching skills", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();
    await screen.findByText("skill-0");

    // Opening the panel (null → index) collapses the grid and must scroll
    // the clicked card back into view.
    await user.click(screen.getByText("skill-5"));
    await screen.findByText("Instructions for skill-5.");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });

    // Switching to another card while the panel is already open keeps the
    // layout stable — no scroll adjustment.
    await user.click(screen.getByText("skill-29"));
    await screen.findByText("Instructions for skill-29.");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    scrollIntoView.mockRestore();
  });

  it("closes the panel via the X button and Escape", async () => {
    const user = userEvent.setup();
    mockFetchSkillsPage.mockResolvedValueOnce(page0);
    renderExplorePage();
    await screen.findByText("skill-0");

    // X button restores the full-width grid.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("complementary")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() =>
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument(),
    );

    // Escape also closes the panel.
    await user.click(screen.getByText("skill-1"));
    expect(await screen.findByRole("complementary")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument(),
    );
  });
});
