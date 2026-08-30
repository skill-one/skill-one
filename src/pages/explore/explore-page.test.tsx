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

import { fetchFullIndex } from "../../lib/skills-api";
import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { ExplorePage } from "./explore-page";

vi.mock("../../lib/skills-api", () => ({
  // The page spreads this into its query key; keep it a stable array.
  SKILLS_QUERY_KEY: ["skills", 5],
  fetchFullIndex: vi.fn(),
}));
vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

const mockFetchFullIndex = vi.mocked(fetchFullIndex);
const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

/** Build a slice of `count` skills starting at global index `offset`. */
function makeSkills(count: number, offset: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${offset + i}`,
    repo: `repo-${offset + i}/skills`,
    description: "",
    stars: 1000,
    downloads: 1000,
  }));
}

/**
 * Mock fetchFullIndex to serve a registry of `total` skills. The page owns
 * filtering, sorting and slicing, so the mock always returns the full list.
 */
function mockRegistry(total: number) {
  mockFetchFullIndex.mockResolvedValue(makeSkills(total, 0));
}

/**
 * Mock a registry of one distinctive "gadget" skill among 49 filler "tool"
 * skills. The names are mutually distant enough that fuzzy search stays
 * deterministic: "gadget" matches exactly one skill, never the fillers.
 */
function mockGadgetRegistry() {
  mockFetchFullIndex.mockResolvedValue([
    {
      name: "gadget-master",
      repo: "acme/gadgets",
      description: "Builds tiny gadgets.",
      stars: 99,
      downloads: 99,
    },
    ...Array.from({ length: 49 }, (_, i) => ({
      name: `tool-${i}`,
      repo: `acme/tool-${i}`,
      description: "A general purpose utility.",
      stars: 10,
      downloads: 10,
    })),
  ]);
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
  mockFetchFullIndex.mockReset();
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
  it("renders the first 24 skills with the total count", async () => {
    mockRegistry(50);
    renderExplorePage();

    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-23")).toBeInTheDocument();
    // Page 1 holds exactly 24 skills; skill-24 belongs to page 2.
    expect(screen.queryByText("skill-24")).not.toBeInTheDocument();
    // The whole index is fetched once; paging is client-side from here on.
    expect(mockFetchFullIndex).toHaveBeenCalledTimes(1);
    expect(screen.getByText("共 50 个")).toBeInTheDocument();
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

  it("renders the next page via the next control without refetching", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByRole("link", { name: "下一页" }));

    expect(await screen.findByText("skill-24")).toBeInTheDocument();
    expect(screen.getByText("skill-47")).toBeInTheDocument();
    expect(screen.queryByText("skill-48")).not.toBeInTheDocument();
    expect(mockFetchFullIndex).toHaveBeenCalledTimes(1);
  });

  it("jumps to a page by clicking its numbered button", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await goToPage(user, 3);

    expect(await screen.findByText("skill-48")).toBeInTheDocument();
    expect(screen.getByText("skill-49")).toBeInTheDocument();
    expect(mockFetchFullIndex).toHaveBeenCalledTimes(1);
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

    // All nine page numbers are rendered, with no ellipsis in the bar. The
    // active page (1) is the editable jump box, not a link.
    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    expect(jump).toHaveValue("1");
    for (let p = 2; p <= 9; p++) {
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
    // collapsing the gap 3..10 into a single ellipsis. Page 1 is the
    // editable jump box rather than a link.
    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    expect(jump).toHaveValue("1");
    expect(screen.getByRole("link", { name: "3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "10" })).toBeInTheDocument();
    expect(screen.getByText("More pages")).toBeInTheDocument();

    // Jump to a visible page (3); the window now stretches further and the
    // ellipsis shrinks, proving the window follows the current page.
    await user.clear(jump);
    await user.type(jump, "3");
    await user.keyboard("{Enter}");
    await screen.findByText("skill-48");
    expect(screen.getByRole("link", { name: "4" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "5" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "跳转到第几页" })).toHaveValue(
      "3",
    );
    expect(screen.getByText("More pages")).toBeInTheDocument();
  });

  it("replaces the standalone jump form with the editable current page box", async () => {
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    // The old "第 [input] / N 页" form is gone entirely; the only way to
    // jump is the current page number box itself.
    expect(screen.queryByText("第")).not.toBeInTheDocument();
    expect(screen.queryByText("/ 3 页")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "跳转到第几页" }),
    ).toBeInTheDocument();
  });

  it("shows the skill count on the pagination row instead of the toolbar", async () => {
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    // The count shares the bottom row with the pagination controls.
    const count = screen.getByText("共 50 个");
    expect(
      count.closest("div")?.querySelector('nav[aria-label="pagination"]'),
    ).not.toBeNull();
  });

  it("jumps directly to a typed page number", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.clear(jump);
    await user.type(jump, "3");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("skill-48")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "跳转到第几页" })).toHaveValue(
      "3",
    );
  });

  it("clamps an out-of-range jump to the last page", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.clear(jump);
    await user.type(jump, "99");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("skill-48")).toBeInTheDocument();
  });

  it("commits a typed jump on blur", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.clear(jump);
    await user.type(jump, "2");
    await user.tab(); // Move focus away → blur commits.

    expect(await screen.findByText("skill-24")).toBeInTheDocument();
  });

  it("keeps the current page while a number is typed but not committed", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.clear(jump);
    await user.type(jump, "2");

    // Still on page 1 until the value is committed.
    expect(screen.getByText("skill-23")).toBeInTheDocument();
    expect(screen.queryByText("skill-24")).not.toBeInTheDocument();
    expect(jump).toHaveValue("2");
  });

  it("reverts to the current page on Escape", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.clear(jump);
    await user.type(jump, "3");
    await user.keyboard("{Escape}");

    // Still on page 1, and the box shows the current page again — the
    // discarded draft must not be committed by the blur that Escape causes.
    expect(screen.getByText("skill-23")).toBeInTheDocument();
    expect(screen.queryByText("skill-24")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "跳转到第几页" })).toHaveValue(
      "1",
    );
  });

  it("reverts an empty commit to the current page", async () => {
    const user = userEvent.setup();
    mockRegistry(50); // 3 pages
    renderExplorePage();
    await screen.findByText("skill-0");

    const jump = screen.getByRole("textbox", { name: "跳转到第几页" });
    await user.clear(jump);
    await user.keyboard("{Enter}");

    // An empty value means "no jump": page 1 stays, box restores "1".
    expect(screen.getByText("skill-23")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "跳转到第几页" })).toHaveValue(
      "1",
    );
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    mockFetchFullIndex.mockRejectedValueOnce(new Error("network error"));
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

  it("filters skills by search text and resets to the first page", async () => {
    const user = userEvent.setup();
    mockGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    // Move to page 2 first so the reset is observable.
    await goToPage(user, 2);
    await screen.findByText("tool-24");

    await user.type(
      screen.getByRole("textbox", { name: "搜索 Skill" }),
      "gadget",
    );

    // Highlighting splits the name into <mark> segments, so match the card
    // via its aria-label, which stays intact.
    expect(
      await screen.findByRole("button", {
        name: "查看 gadget-master 详情",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("共 1 个")).toBeInTheDocument();
    // The grid went back to its first page and shows only the match.
    expect(screen.queryByText("tool-24")).not.toBeInTheDocument();
    // A single result fits on one page, so the pagination bar disappears.
    expect(
      screen.queryByRole("link", { name: "下一页" }),
    ).not.toBeInTheDocument();
  });

  it("restores the full registry when the search is cleared", async () => {
    const user = userEvent.setup();
    mockGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    const input = screen.getByRole("textbox", { name: "搜索 Skill" });
    await user.type(input, "gadget");
    expect(await screen.findByText("共 1 个")).toBeInTheDocument();

    await user.clear(input);

    expect(await screen.findByText("tool-0")).toBeInTheDocument();
    expect(screen.getByText("共 50 个")).toBeInTheDocument();
  });

  it("shows a no-match empty state for a search with no results", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.type(
      screen.getByRole("textbox", { name: "搜索 Skill" }),
      "zzzzzzqqqq",
    );

    expect(
      await screen.findByText("未找到匹配“zzzzzzqqqq”的 Skill"),
    ).toBeInTheDocument();
  });

  it("orders search results by field weight (name > repo > description)", async () => {
    const user = userEvent.setup();
    // "widget" appears verbatim in exactly one field of each skill — name,
    // repo and description respectively — so the ranking is decided by the
    // field weights alone.
    mockFetchFullIndex.mockResolvedValue([
      {
        name: "widget-pack",
        repo: "acme/unrelated",
        description: "Packs widgets nicely.",
        stars: 1,
        downloads: 1,
      },
      {
        name: "misc-tools",
        repo: "acme/widget-lab",
        description: "Various utilities.",
        stars: 1,
        downloads: 1,
      },
      {
        name: "docgen",
        repo: "acme/docs",
        description: "Turns code into a widget spec.",
        stars: 1,
        downloads: 1,
      },
    ]);
    renderExplorePage();
    await screen.findByText("widget-pack");

    await user.type(
      screen.getByRole("textbox", { name: "搜索 Skill" }),
      "widget",
    );

    expect(await screen.findByText("docgen")).toBeInTheDocument();
    // Cards appear in DOM order; read each card's aria-label, which stays
    // intact even when highlighted names are split across <mark> segments.
    const cardOrder = () =>
      screen
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((el) => el.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""));
    expect(cardOrder()).toEqual(["widget-pack", "misc-tools", "docgen"]);
  });

  it("ranks search results by install count among equally relevant matches", async () => {
    const user = userEvent.setup();
    // Registry order deliberately opposes the popularity order: without a
    // search the cards render as beta → alpha, so only the search's install
    // boost can flip them to alpha → beta.
    mockFetchFullIndex.mockResolvedValue([
      {
        name: "beta-redis-clip",
        repo: "acme/beta",
        description: "Utilities.",
        stars: 10,
        downloads: 10,
      },
      {
        name: "alpha-redis-tool",
        repo: "acme/alpha",
        description: "Utilities.",
        stars: 10,
        downloads: 5_000_000,
      },
    ]);
    renderExplorePage();
    await screen.findByText("beta-redis-clip");

    // Cards appear in DOM order; read each card's aria-label, which stays
    // intact even when highlighted names are split across <mark> segments.
    const cardOrder = () =>
      screen
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((el) => el.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""));
    expect(cardOrder()).toEqual(["beta-redis-clip", "alpha-redis-tool"]);

    await user.type(
      screen.getByRole("textbox", { name: "搜索 Skill" }),
      "redis",
    );

    expect(
      await screen.findByRole("button", {
        name: "查看 alpha-redis-tool 详情",
      }),
    ).toBeInTheDocument();
    expect(cardOrder()).toEqual(["alpha-redis-tool", "beta-redis-clip"]);
  });

  it("highlights matched terms on search results only", async () => {
    const user = userEvent.setup();
    mockGadgetRegistry();
    const { container } = renderExplorePage();
    await screen.findByText("gadget-master");

    // Without a search nothing is highlighted.
    expect(container.querySelector("mark")).toBeNull();

    await user.type(
      screen.getByRole("textbox", { name: "搜索 Skill" }),
      "gadget",
    );

    // The name's matched token is wrapped in a <mark>; the full name stays
    // one logical string across the highlight segments.
    const mark = await screen.findByText("gadget");
    expect(mark.tagName).toBe("MARK");
    const heading = screen
      .getByRole("button", { name: "查看 gadget-master 详情" })
      .querySelector("h3");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("gadget-master");
  });

  it("sorts skills by downloads and by name from the toolbar", async () => {
    const user = userEvent.setup();
    mockFetchFullIndex.mockResolvedValue([
      { name: "alpha", repo: "o/alpha", description: "", stars: 0, downloads: 5 },
      { name: "beta", repo: "o/beta", description: "", stars: 0, downloads: 300 },
      { name: "gamma", repo: "o/gamma", description: "", stars: 0, downloads: 50 },
    ]);
    renderExplorePage();
    await screen.findByText("alpha");

    // Cards appear in DOM order; exact-match the names so the repo subtitles
    // ("o/alpha") don't interfere.
    const cardOrder = () =>
      screen
        .getAllByText(/^(alpha|beta|gamma)$/)
        .map((el) => el.textContent);

    expect(cardOrder()).toEqual(["alpha", "beta", "gamma"]);

    // Sort by downloads: 300 → 50 → 5.
    await user.click(screen.getByRole("button", { name: "默认排序" }));
    await user.click(screen.getByRole("menuitemradio", { name: "按下载量" }));
    expect(cardOrder()).toEqual(["beta", "gamma", "alpha"]);

    // Sort by name; the trigger label follows the active order.
    await user.click(screen.getByRole("button", { name: "按下载量" }));
    await user.click(screen.getByRole("menuitemradio", { name: "按名称" }));
    expect(cardOrder()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("offers the category placeholder menu with 全部 preselected", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByRole("button", { name: "分类" }));

    // The registry index has no category field: 全部 is the only selectable
    // entry (permanently checked) and the rest is a disabled coming-soon hint.
    expect(screen.getByRole("menuitemradio", { name: "全部" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("menuitem", { name: "更多分类 · 即将上线" }),
    ).toHaveAttribute("aria-disabled", "true");
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
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("skill-0")).toBeInTheDocument();
    expect(within(panel).getByText("repo-0/skills")).toBeInTheDocument();
  });

  it("switches skills inside the panel via the arrow keys", async () => {
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await userEvent.setup().click(screen.getByText("skill-0"));
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();

    // While the modal drawer is open, ←/→ switch skills in place.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await screen.findByText("Instructions for skill-1."),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();
  });

  it("closes the panel via the X button and Escape", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    // X button closes the drawer.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // Escape also closes the panel (Radix's document-level dismiss).
    await user.click(screen.getByText("skill-1"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("opens the drawer without reflowing the grid", async () => {
    const user = userEvent.setup();
    mockRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    const grid = screen.getByText("skill-0").closest(".grid")!;
    expect(grid.className).toBe(
      "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    );

    // Opening the drawer overlays the grid: the grid's classes — and with
    // them its layout and scroll position — stay exactly the same while
    // the drawer is open and after it closes.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(grid.className).toBe(
      "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(grid.className).toBe(
      "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    );
  });
});
