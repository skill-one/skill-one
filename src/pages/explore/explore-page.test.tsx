import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter, Route, Routes } from "react-router-dom";

import { fetchSkillsPage } from "../../lib/skills-api";
import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { ExplorePage } from "./explore-page";

vi.mock("../../lib/skills-api", () => ({ fetchSkillsPage: vi.fn() }));
vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

const mockFetchSkillsPage = vi.mocked(fetchSkillsPage);
const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

/** Build a slice of `count` skills starting at global index `offset`. */
function makeSkills(count: number, offset: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${offset + i}`,
    repo: `repo-${offset + i}/skills`,
    description: "",
    stars: 1000,
  }));
}

/**
 * Mock fetchSkillsPage to serve 24-per-page slices from a registry with
 * `total` skills — mirrors the real implementation's slice semantics.
 */
function mockRegistry(total: number) {
  mockFetchSkillsPage.mockImplementation(async (page: number, pageSize) => {
    const size = pageSize ?? 24;
    const start = page * size;
    const count = Math.max(0, Math.min(size, total - start));
    return {
      skills: makeSkills(count, start),
      hasMore: start + size < total,
      total,
    };
  });
}

let queryClient: QueryClient;

function renderExplorePage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ExplorePage />
    </QueryClientProvider>,
  );
}

/** Click through to a given numbered page by clicking its page link. */
async function goToPage(
  user: ReturnType<typeof userEvent.setup>,
  page: number,
) {
  await user.click(screen.getByRole("link", { name: String(page) }));
}

beforeEach(() => {
  // Fresh cache per test; retries are off so a rejected fetch surfaces an
  // error state immediately instead of being retried silently.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10 * 60 * 1000, retry: false } },
  });
  mockFetchSkillsPage.mockReset();
  mockFetchSkillDetail.mockReset();
  mockFetchSkillDetail.mockImplementation(
    async (_repo: string, id: string) => ({
      name: id,
      description: `Description of ${id}.`,
      instructions: `Instructions for ${id}.`,
      path: `skills/${id}/SKILL.md`,
    }),
  );
});

describe("ExplorePage", () => {
  it("renders the first 24 skills of the first page with a total hint", async () => {
    mockRegistry(50);
    renderExplorePage();

    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-23")).toBeInTheDocument();
    // Page 1 holds exactly 24 skills; skill-24 belongs to page 2.
    expect(screen.queryByText("skill-24")).not.toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(1);
    expect(mockFetchSkillsPage).toHaveBeenCalledWith(0, 24);
  });

  it("disables previous on the first page and enables next", async () => {
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    expect(screen.getByRole("link", { name: "上一页" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("fetches and renders the next page via the next control", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByRole("link", { name: "下一页" }));

    expect(await screen.findByText("skill-24")).toBeInTheDocument();
    expect(screen.getByText("skill-47")).toBeInTheDocument();
    expect(screen.queryByText("skill-48")).not.toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenLastCalledWith(1, 24);
  });

  it("jumps to a page by clicking its numbered button", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await goToPage(user, 3);

    expect(await screen.findByText("skill-48")).toBeInTheDocument();
    expect(screen.getByText("skill-49")).toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenLastCalledWith(2, 24);
    expect(mockFetchSkillsPage).toHaveBeenCalledTimes(2);
  });

  it("disables next on the last page", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await goToPage(user, 3);
    await screen.findByText("skill-48");

    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("link", { name: "上一页" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("shows every page number directly when there are few pages", async () => {
    mockRegistry(216); // 9 pages — exactly the "show all" threshold
    renderExplorePage();
    await screen.findByText("skill-0");

    // All nine page links are rendered, with no ellipsis in the bar.
    for (let p = 1; p <= 9; p++) {
      expect(screen.getByRole("link", { name: String(p) })).toBeInTheDocument();
    }
    expect(screen.queryByText("More pages")).not.toBeInTheDocument();
  });

  it("collapses distant page numbers into an ellipsis window", async () => {
    const user = userEvent.setup();
    mockRegistry(240); // 10 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    // Page 1 keeps the first page, a window (1..3) and the last page,
    // collapsing the gap 3..10 into a single ellipsis.
    expect(screen.getByRole("link", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "10" })).toBeInTheDocument();
    expect(screen.getByText("More pages")).toBeInTheDocument();

    // Jump to a visible page (3); the window now stretches further and the
    // ellipsis shrinks, proving the window follows the current page.
    await goToPage(user, 3);
    await screen.findByText("skill-48");
    expect(screen.getByRole("link", { name: "4" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "3" })).toBeInTheDocument();
    expect(screen.getByText("More pages")).toBeInTheDocument();
  });

  it("jumps directly to a typed page number", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.type(jump, "3");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("skill-48")).toBeInTheDocument();
    expect(mockFetchSkillsPage).toHaveBeenLastCalledWith(2, 24);
  });

  it("clamps an out-of-range jump to the last page", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.type(jump, "99");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("skill-48")).toBeInTheDocument();
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    mockFetchSkillsPage.mockRejectedValueOnce(new Error("network error"));
    mockRegistry(50);
    renderExplorePage();

    expect(
      await screen.findByText("加载失败：network error"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
  });

  it("does not navigate away under HashRouter when clicking a page link", async () => {
    // Regression: the app runs under <HashRouter>, so a pagination anchor's
    // default href="#" navigation would push a new hash route and remount the
    // page. onClick must preventDefault to keep the hash (and the route) fixed.
    const user = userEvent.setup();
    mockRegistry(50);
    window.history.replaceState(null, "", "#/explore");
    render(
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <Routes>
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/" element={<div>landing</div>} />
          </Routes>
        </HashRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("skill-0");
    const hashBefore = window.location.hash;

    await goToPage(user, 2);
    await screen.findByText("skill-24");

    // The hash (and therefore the active route) must be unchanged.
    expect(window.location.hash).toBe(hashBefore);
    // Page 2 still loads its own data, proving the click handled the page turn
    // without relying on a route change.
    expect(screen.getByText("skill-47")).toBeInTheDocument();
  });

  it("switches between source tabs", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

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
    mockRegistry(50);
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
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByText("skill-0"));
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();

    // Clicking another card while the panel is open swaps the skill in place.
    await user.click(screen.getByText("skill-23"));
    expect(
      await screen.findByText("Instructions for skill-23."),
    ).toBeInTheDocument();
  });

  it("scrolls the card into view when the panel opens, but not when switching skills", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    mockRegistry(50);
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
    await user.click(screen.getByText("skill-23"));
    await screen.findByText("Instructions for skill-23.");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    scrollIntoView.mockRestore();
  });

  it("closes the panel via the X button and Escape", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
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
