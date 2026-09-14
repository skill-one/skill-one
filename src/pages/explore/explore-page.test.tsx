import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  configure,
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter } from "react-router";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { PAGE_SIZE } from "../../lib/pagination";
import {
  SKILL_CARD_SKELETON_CLASS,
  SKILL_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import type { RegistryHarness } from "../../test/registry-harness";
import { ExplorePage } from "./explore-page";

/**
 * Search cases wait out the page's real 150 ms debounce plus the worker
 * round-trip, so they measure elapsed time rather than ticks. The default 1 s
 * budget is exceeded when the CPU is busy (typecheck in parallel), which fails
 * the test without any product bug; 5 s keeps the wait honest and stable.
 */
configure({ asyncUtilTimeout: 5000 });

/**
 * The registry client is replaced by a real-controller-driven harness, so
 * the page tests exercise the exact RPC/event contract the worker speaks —
 * including streaming progress, the search field's unlock on `ready`, and the
 * ready-epoch invalidation.
 */
vi.mock("../../lib/registry/client", async () => {
  const { createRegistryHarness, createRegistryClientMock } =
    await import("../../test/registry-harness");
  return createRegistryClientMock(createRegistryHarness());
});

const harness = (
  (await import("../../lib/registry/client")) as unknown as {
    __harness: RegistryHarness;
  }
).__harness;

vi.mock("../../lib/skill-detail-api", () => ({
  MIRROR: { repo: "skill-one/skills-sh-mirror", ref: "dist" },
  fetchSkillDetail: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

/** The one repository every `makeSkills` skill belongs to. */
const BATCH_REPO = "acme/batch";

/** Build a slice of `count` skills starting at global index `offset`. */
function makeSkills(count: number, offset: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${offset + i}`,
    repo: BATCH_REPO,
    description: "",
    stars: 1000,
    downloads: 1000,
    path: `skills/skill-${offset + i}`,
  }));
}

/**
 * Load the harness with a complete registry of `total` skills before the
 * page mounts — the cold-start-cache path, where the page paints instantly.
 * All skills share one repository, so the page is a single (expanded) group
 * showing every card — the closest shape to the old flat grid.
 */
function bootRegistry(total: number) {
  harness.reset();
  harness.init();
  harness.pushAll(makeSkills(total, 0));
  harness.complete();
}

/**
 * A registry of one distinctive "gadget" skill among filler "tool" skills.
 * The names are mutually distant enough that the search stays deterministic:
 * "gadget" matches exactly one skill, never the fillers. Every skill is its
 * own repository, so the grouped list is one group per skill.
 */
function gadgetRegistry(): Skill[] {
  return [
    {
      name: "gadget-master",
      repo: "acme/gadgets",
      description: "Builds tiny gadgets.",
      stars: 99,
      downloads: 99,
      path: "skills/gadget-master",
    },
    ...Array.from({ length: PAGE_SIZE + 10 }, (_, i) => ({
      name: `tool-${i}`,
      repo: `acme/tool-${i}`,
      description: "A general purpose utility.",
      stars: 10,
      downloads: 10,
      path: `skills/tool-${i}`,
    })),
  ];
}

function bootGadgetRegistry() {
  harness.reset();
  harness.init();
  harness.pushAll(gadgetRegistry());
  harness.complete();
}

let queryClient: QueryClient;

function renderExplorePage() {
  return render(
    <QueryClientProvider client={queryClient}>
      {/* The real app mounts pages under a HashRouter. */}
      <HashRouter>
        <ExplorePage />
      </HashRouter>
    </QueryClientProvider>,
  );
}

/**
 * The search field, once the worker's index is ready to answer it. The field
 * stays locked until then, so every search case waits for the same unlock
 * instead of racing the index build.
 */
async function searchField(): Promise<HTMLElement> {
  const input = screen.getByRole("textbox", { name: "搜索 Skill" });
  await waitFor(() => expect(input).toBeEnabled());
  return input;
}

/**
 * The group header trigger of one group, addressed by its aria-label —
 * titles stay intact there even when the figures beside them are long.
 */
function groupHeader(title: string, count = 1) {
  return screen.getByRole("button", {
    name: `分组 ${title}，${count} 个 skill`,
  });
}

/** Cards in DOM order, named by their stable aria-label. */
const cardOrder = () =>
  screen
    .getAllByRole("button", { name: /查看 .+ 详情/ })
    .map((el) => el.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""));

beforeEach(() => {
  // Fresh cache per test; retries are off so a rejected fetch surfaces an
  // error state immediately instead of being retried silently.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10 * 60 * 1000, retry: false } },
  });
  harness.reset();
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
  it("renders the grouped list", async () => {
    bootRegistry(50);
    renderExplorePage();

    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    // The group previews its first six skills; the rest wait behind the
    // expander so one big repository doesn't dominate the page.
    expect(screen.queryByText("skill-6")).not.toBeInTheDocument();
    // The page answered one RPC; browsing never re-downloads the registry.
    expect(harness.downloads).toBe(1);
  });

  it("collapses a long group behind an expander", async () => {
    const user = userEvent.setup();
    // One repository with eight skills: six on the page, two behind it.
    harness.init();
    harness.pushAll(makeSkills(8, 0));
    harness.complete();
    renderExplorePage();

    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-5")).toBeInTheDocument();
    expect(screen.queryByText("skill-6")).not.toBeInTheDocument();

    // The expander reveals the rest in place...
    await user.click(
      screen.getByRole("button", { name: "展开其余 2 个" }),
    );
    expect(await screen.findByText("skill-6")).toBeInTheDocument();
    expect(screen.getByText("skill-7")).toBeInTheDocument();

    // ...and flips into a collapse affordance.
    await user.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() =>
      expect(screen.queryByText("skill-6")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("skill-5")).toBeInTheDocument();

    // Exactly six cards mount while folded; the header keeps naming the
    // group's full count.
    expect(
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情/ }),
    ).toHaveLength(6);
    expect(groupHeader(BATCH_REPO, 8)).toBeInTheDocument();
  });

  it("previews two rows of the current layout, not a fixed count", async () => {
    const user = userEvent.setup();
    harness.init();
    harness.pushAll(makeSkills(10, 0));
    harness.complete();
    const { container } = renderExplorePage();
    await screen.findByText("skill-0");

    // No layout in jsdom: the fixed fallback of six applies...
    expect(screen.queryByText("skill-6")).not.toBeInTheDocument();

    // ...until the grid reports a real layout. The component reads the
    // resolved grid-template-columns (one track per column); four tracks
    // make the preview two rows = eight cards. Setting it inline works for
    // both jsdom's computed style and a real browser.
    const grid = container.querySelector("ul.grid") as HTMLElement;
    grid.style.gridTemplateColumns = "280px 280px 280px 280px";

    // The measurement re-runs when the expander settles back down (the same
    // re-run re-arms it after a fold/unfold cycle).
    await user.click(screen.getByRole("button", { name: "展开其余 4 个" }));
    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(await screen.findByText("skill-7")).toBeInTheDocument();
    expect(screen.queryByText("skill-8")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开其余 2 个" }),
    ).toBeInTheDocument();
  });

  it("keeps a pinned header under the pointer when it is collapsed", async () => {
    bootRegistry(50);
    const { container } = renderExplorePage();
    await screen.findByText("skill-0");

    const header = groupHeader(BATCH_REPO, 50);
    const scrollBox = container.querySelector(
      ".overflow-y-auto",
    ) as HTMLElement;
    scrollBox.scrollTop = 500;

    // While pinned, the header sits at the container's top edge (60px below
    // the window top); once its cards are gone it snaps 200px up to its
    // natural position. The page must compensate so the header — just
    // clicked — stays where the pointer met it.
    vi.spyOn(header, "getBoundingClientRect")
      .mockReturnValueOnce({ top: 60 } as DOMRect)
      .mockReturnValueOnce({ top: -140 } as DOMRect);
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    fireEvent.click(header);
    expect(screen.queryByText("skill-0")).not.toBeInTheDocument();
    // 500 scrolled, minus the 200px upward snap = the header holds still.
    expect(scrollBox.scrollTop).toBe(300);

    raf.mockRestore();
    vi.mocked(header.getBoundingClientRect).mockRestore();
  });

  it("renders the leading groups first and reveals more as the reader scrolls", async () => {
    // Twelve one-skill repositories: twice the initial render chunk.
    harness.init();
    harness.pushAll(
      Array.from({ length: 12 }, (_, i) => ({
        name: `skill-${i}`,
        repo: `repo-${String(i).padStart(2, "0")}/skills`,
        description: "",
        stars: 10,
        downloads: 10,
        path: `skills/skill-${i}`,
      })),
    );
    harness.complete();
    renderExplorePage();

    await screen.findByText("skill-0");

    // The first chunk is mounted (groups and their cards)...
    // The header count must match the trigger's exact aria-label shape — a
    // looser prefix would also catch the repo link button printed on each
    // rendered card.
    const renderedHeaders = () =>
      screen
        .getAllByRole("button", { name: /^分组 repo-\d+\/skills，/ }).length;
    expect(renderedHeaders()).toBe(6);
    expect(screen.getByText("skill-5")).toBeInTheDocument();
    expect(screen.queryByText("skill-6")).not.toBeInTheDocument();

    // ...and scrolling the sentinel into view extends the run. The observer
    // re-arms on every extension, so a sentinel that stays in view keeps
    // revealing groups until the answer is fully mounted.
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    lastObserver().trigger(true);
    expect(await screen.findByText("skill-6")).toBeInTheDocument();
    await waitFor(() => expect(renderedHeaders()).toBe(12));
    expect(screen.getByText("skill-11")).toBeInTheDocument();

    // Once everything is mounted the sentinel is gone; a late trigger is a
    // no-op instead of an error.
    lastObserver().trigger(true);
    expect(renderedHeaders()).toBe(12);
  });

  it("collapses a group on header click and expands it back", async () => {
    const user = userEvent.setup();
    harness.init();
    harness.pushAll(
      ["a", "b", "c", "d", "e"].map((r, i) => ({
        name: `skill-${i}`,
        repo: `repo-${r}/skills`,
        description: "",
        stars: 10,
        downloads: 10,
        path: `skills/skill-${i}`,
      })),
    );
    harness.complete();
    renderExplorePage();
    // Every group starts expanded — the five cards are all on screen.
    await screen.findByText("skill-4");

    const header = groupHeader("repo-d/skills");
    await user.click(header);
    await waitFor(() =>
      expect(screen.queryByText("skill-3")).not.toBeInTheDocument(),
    );
    // The header itself never folds away.
    expect(groupHeader("repo-d/skills")).toBeInTheDocument();

    await user.click(header);
    expect(await screen.findByText("skill-3")).toBeInTheDocument();
  });

  it("shows the group header's stars and skill count", async () => {
    harness.init();
    harness.pushAll([
      {
        name: "widget-core",
        repo: "acme/widgets",
        description: "Core widget engine.",
        stars: 12_300,
        downloads: 500,
        path: "skills/widget-core",
      },
      {
        name: "widget-cli",
        repo: "acme/widgets",
        description: "CLI for widgets.",
        stars: 12_300,
        downloads: 100,
        path: "skills/widget-cli",
      },
      {
        name: "other",
        repo: "acme/other",
        description: "Unrelated.",
        stars: 1,
        downloads: 1,
        path: "skills/other",
      },
    ]);
    harness.complete();
    renderExplorePage();

    // The most-starred group leads the list and starts expanded.
    expect(await screen.findByText("widget-core")).toBeInTheDocument();
    const header = groupHeader("acme/widgets", 2);
    expect(header).toBeInTheDocument();
    expect(within(header).getByText("acme/widgets")).toBeInTheDocument();
    // The leading group carries its ordinal under the current sort, as a
    // gold medal circle (text-only in the DOM).
    expect(within(header).getByText("1")).toBeInTheDocument();
    // Stars render compactly, exactly as the card rail prints them. The
    // figure shares its span with the leading separator dot, so match by
    // fragment.
    expect(
      within(header).getByText(new RegExp(formatCount(12_300))),
    ).toBeInTheDocument();
    // The skill count sits at the row's far edge.
    expect(within(header).getByText("2 个")).toBeInTheDocument();
  });

  it("orders groups by repo stars and skills within a group by popularity", async () => {
    const user = userEvent.setup();
    harness.init();
    harness.pushAll([
      {
        name: "b2",
        repo: "o/big",
        description: "",
        stars: 500,
        downloads: 100,
      },
      {
        name: "b1",
        repo: "o/big",
        description: "",
        stars: 500,
        downloads: 10,
      },
      {
        name: "n1",
        repo: "o/none",
        description: "",
        stars: 0,
        downloads: 1_000_000,
      },
    ]);
    harness.complete();
    renderExplorePage();
    await screen.findByText("b2");

    // The repo grouping puts the starred repository's group first — even
    // though its skills are far less installed — and orders the group's own
    // cards by popularity (b2's installs beat b1's). A group's stars, not a
    // lone skill's installs, decide the group's place.
    expect(cardOrder()).toEqual(["b2", "b1", "n1"]);

    // The grouping control offers the three modes — each annotated with the
    // group count it would produce over this answer — and nothing else; the
    // textContent concatenates label and count.
    await user.click(screen.getByRole("button", { name: "按仓库" }));
    const rows = screen
      .getAllByRole("menuitemradio")
      .map((m) => m.textContent);
    expect(rows).toEqual([
      "按仓库2 组",
      "按热度1 组",
      "按类型1 组",
    ]);
  });

  it("filters skills by search text", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    // Under a loaded runner one keystroke can outlast the 150 ms debounce, so
    // an intermediate prefix query may briefly render other rows. One
    // `waitFor` over the whole settled block re-runs on the swap's mutations
    // and passes only once the final answer is on screen.
    await waitFor(() => {
      // Highlighting splits the name into <mark> segments, so match the row
      // via its aria-label, which stays intact.
      expect(
        screen.getByRole("button", { name: "查看 gadget-master 详情" }),
      ).toBeInTheDocument();
      // No filler group survives the search.
      expect(
        screen.queryByRole("button", { name: /^分组 acme\/tool-/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("restarts progressive rendering when the answer's definition changes", async () => {
    const user = userEvent.setup();
    // Twelve one-skill "gadget" repositories: every one of them matches the
    // search, so the search answer alone is bigger than one render chunk.
    harness.init();
    harness.pushAll(
      Array.from({ length: 12 }, (_, i) => ({
        name: `gadget-${String(i).padStart(2, "0")}`,
        repo: `acme/gadget-${String(i).padStart(2, "0")}`,
        description: "A gadget.",
        stars: 10,
        downloads: 10,
      })),
    );
    harness.complete();
    renderExplorePage();
    await screen.findByText("gadget-00");

    // The header count must match the trigger's exact aria-label shape — a
    // looser prefix would also catch the repo link printed on each card.
    const renderedGadgetHeaders = () =>
      screen.getAllByRole("button", {
        name: /^分组 acme\/gadget-\d+，/,
      });

    // The reader has scrolled: the browsed list is fully mounted.
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    lastObserver().trigger(true);
    await waitFor(() =>
      expect(renderedGadgetHeaders()).toHaveLength(12),
    );

    // A new answer restarts the run at the first chunk — it must not inherit
    // the scrolled depth of the list it replaces. The reset lands with the
    // keystroke; the search answer lands one debounce later, so both halves
    // wait.
    await user.type(await searchField(), "gadget");
    await waitFor(() => expect(renderedGadgetHeaders()).toHaveLength(6));

    // And scrolling the new answer reveals the rest of it.
    lastObserver().trigger(true);
    await waitFor(() => expect(renderedGadgetHeaders()).toHaveLength(12));
  }, 15000);

  it("restores the full registry when the search is cleared", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    const input = await searchField();
    await user.type(input, "gadget");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^分组 acme\/tool-/ }),
      ).not.toBeInTheDocument(),
    );

    await user.clear(input);

    expect(await screen.findByText("tool-0")).toBeInTheDocument();
  }, 15000);

  it("shows a no-match empty state for a search with no results", async () => {
    const user = userEvent.setup();
    bootRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.type(await searchField(), "zzzzzzqqqq");

    expect(
      await screen.findByText("未找到匹配“zzzzzzqqqq”的 Skill"),
    ).toBeInTheDocument();
  });

  it("orders search results by field weight (name > repo > description)", async () => {
    const user = userEvent.setup();
    // "widget" appears verbatim in exactly one field of each skill — name,
    // repo and description respectively — so the ranking is decided by the
    // field weights alone. One skill per repository: the group order under a
    // search is the relevance order of the groups' first (best) hits.
    harness.init();
    harness.pushAll([
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
    harness.complete();
    renderExplorePage();
    await screen.findByText("widget-pack");

    await user.type(await searchField(), "widget");

    // Rows appear in DOM order; read each row's aria-label, which stays
    // intact even when highlighted names are split across <mark> segments.
    // The browsed list orders the same skills alphabetically by repo, so the
    // assertion must wait out the swap rather than trust the first paint.
    await waitFor(() =>
      expect(cardOrder()).toEqual(["widget-pack", "misc-tools", "docgen"]),
    );
  });

  it("ranks search results by popularity among equally relevant matches", async () => {
    const user = userEvent.setup();
    // Registry order: ["alpha-redis-clip", "beta-redis-tool"] — the opposite
    // of the popularity order.
    harness.init();
    harness.pushAll([
      {
        name: "alpha-redis-clip",
        repo: "acme/alpha",
        description: "Utilities.",
        stars: 10,
        downloads: 10,
      },
      {
        name: "beta-redis-tool",
        repo: "acme/beta",
        description: "Utilities.",
        stars: 10,
        downloads: 5_000_000,
      },
    ]);
    harness.complete();
    renderExplorePage();
    await screen.findByText("alpha-redis-clip");

    await user.type(await searchField(), "redis");

    // Both matches are equally relevant, so the search's install boost puts the
    // popular one first — a reorder the browsed list's order alone cannot
    // explain, which is also the proof that a search answers in relevance order
    // rather than in the order the browsed list had.
    await waitFor(() =>
      expect(cardOrder()).toEqual(["beta-redis-tool", "alpha-redis-clip"]),
    );
  });

  it("highlights matched terms on search results only", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    const { container } = renderExplorePage();
    await screen.findByText("gadget-master");

    // Without a search nothing is highlighted.
    expect(container.querySelector("mark")).toBeNull();

    await user.type(await searchField(), "gadget");

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

  it("keeps the grouping control in charge while searching", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    const input = await searchField();
    await user.type(input, "gadget");

    // The search swap is done once every filler group is gone.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^分组 acme\/tool-/ }),
      ).not.toBeInTheDocument(),
    );

    // A search narrows the answer but not the reader's questions: the
    // grouping control stays live, and regrouping the matches works. The
    // menu rows carry their group counts, so match by prefix.
    await user.click(screen.getByRole("button", { name: "按仓库" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^按类型/ }));

    // The gadget is unprofiled, so the answer pools into one group.
    expect(groupHeader("未分类")).toBeInTheDocument();
  });

  it("groups the list by profile domain and back to repositories", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll(makeSkills(6, 0));
    harness.complete();
    // Profiles land with the same boot; the grouping settles once the
    // index is rebuilt over the decorated skills.
    harness.publishProfiles({
      "acme/batch/skill-0": { domain: "开发编程" },
      "acme/batch/skill-1": { domain: "内容创作" },
    });
    renderExplorePage();
    await screen.findByText("skill-0");

    // The grouping control is present from the start; open it and switch
    // the mode.
    await user.click(screen.getByRole("button", { name: "按仓库" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^按类型/ }));

    // The same six skills regroup: two profiled domains plus the 未分类
    // pool for the other four — ordered by size.
    expect(await screen.findByText("未分类")).toBeInTheDocument();
    expect(groupHeader("开发编程", 1)).toBeInTheDocument();
    expect(groupHeader("内容创作", 1)).toBeInTheDocument();
    expect(groupHeader("未分类", 4)).toBeInTheDocument();
    expect(screen.getByText("skill-5")).toBeInTheDocument();

    // Back to repositories: one group again, every skill of it visible.
    await user.click(screen.getByRole("button", { name: "按类型" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^按仓库/ }));
    expect(await screen.findByText("skill-5")).toBeInTheDocument();
    expect(groupHeader("acme/batch", 6)).toBeInTheDocument();
  });

  it("chunks the popularity grouping into TOP buckets", async () => {
    harness.init();
    // 130 skills: three buckets of 50/50/30.
    harness.pushAll(
      Array.from({ length: 130 }, (_, i) => ({
        name: `skill-${i}`,
        repo: `acme/skill-${i}`,
        description: "",
        stars: 2000 - i,
        downloads: 2000 - i,
        path: `skills/skill-${i}`,
      })),
    );
    harness.complete();
    renderExplorePage();
    await screen.findByText("skill-0");

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "按仓库" }));
    await userEvent
      .setup()
      .click(screen.getByRole("menuitemradio", { name: /^按热度/ }));

    // Rank buckets in rank order.
    expect(await screen.findByText("TOP 1-50")).toBeInTheDocument();
    expect(groupHeader("TOP 51-100", 50)).toBeInTheDocument();
    expect(groupHeader("TOP 101-130", 30)).toBeInTheDocument();
    // The first bucket holds the top of the popularity order.
    expect(screen.getByText("skill-0")).toBeInTheDocument();
  });

  it("shows an error state and recovers via retry", async () => {
    const user = userEvent.setup();
    harness.init();
    harness.fail(new Error("network error"));
    renderExplorePage();

    expect(
      await screen.findByText("加载失败：network error"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    // The retry re-downloads (download #2), the fresh stream lands and the
    // ready epoch refetches the groups out of the failure state.
    harness.pushAll(makeSkills(50, 0));
    harness.complete();
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(harness.downloads).toBe(2);
  });

  it("opens the detail panel when a row is clicked", async () => {
    const user = userEvent.setup();
    bootRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.click(screen.getByText("skill-0"));

    // Await the async detail content first; the rest renders with it.
    expect(
      await screen.findByText("Instructions for skill-0."),
    ).toBeInTheDocument();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("skill-0")).toBeInTheDocument();
    expect(within(panel).getByText(BATCH_REPO)).toBeInTheDocument();
  });

  it("switches skills inside the panel via the arrow keys", async () => {
    bootRegistry(50);
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

  it("closes the panel via the overlay and Escape", async () => {
    const user = userEvent.setup();
    bootRegistry(50);
    renderExplorePage();
    await screen.findByText("skill-0");

    // Clicking the overlay closes the drawer.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(document.querySelector('[data-slot="drawer-overlay"]')!);
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

  it("opens the drawer without reflowing the group list", async () => {
    const user = userEvent.setup();
    bootRegistry(50);
    const { container } = renderExplorePage();
    await screen.findByText("skill-0");

    const list = container.querySelector("ul.grid")!;
    expect(list.className).toContain(SKILL_LIST_CLASS);
    // The group previews six cards; the list run is the preview, not the
    // full 50-skill group.
    expect(list.querySelectorAll("li")).toHaveLength(6);

    // Opening the drawer overlays the list: its classes — and with them its
    // layout and scroll position — stay exactly the same while the drawer is
    // open and after it closes.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(list.className).toContain(SKILL_LIST_CLASS);

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(list.className).toContain(SKILL_LIST_CLASS);
    expect(list.querySelectorAll("li")).toHaveLength(6);
  });
});

describe("ExplorePage streaming", () => {
  it("paints a skeleton list while the first snapshot is still in flight", async () => {
    harness.init();
    const { container } = renderExplorePage();
    await act(async () => {});

    // The switch is instant: card-shaped skeletons fill the list instead of a
    // spinner, and no card is rendered from nothing.
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons).toHaveLength(12);
    expect(skeletons[0]).toHaveClass(SKILL_CARD_SKELETON_CLASS);
    expect(screen.queryByText("skill-0")).not.toBeInTheDocument();

    // The first streamed batch replaces the skeleton with real cards.
    harness.pushAll(makeSkills(3, 0));
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("renders groups from progress snapshots while the index is still streaming", async () => {
    harness.init();
    renderExplorePage();
    await act(async () => {});

    harness.pushAll(makeSkills(PAGE_SIZE + 5, 0));

    // The group paints from the partial data (its first six as the preview)
    // and grows in place as more of the stream lands, without disturbing the
    // group the reader already has open.
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-5")).toBeInTheDocument();

    harness.pushAll(makeSkills(PAGE_SIZE + 20, 0).slice(PAGE_SIZE + 5));
    // The refetch over the grown prefix updates the group's card count in
    // place; wait it out rather than racing the swap.
    await waitFor(() =>
      expect(groupHeader(BATCH_REPO, PAGE_SIZE + 20)).toBeInTheDocument(),
    );
  });

  it("keeps search locked until the index over the registry is ready", async () => {
    harness.init();
    renderExplorePage();
    await act(async () => {});

    // Only the first 10 skills have streamed in, including the gadget.
    harness.pushAll(gadgetRegistry().slice(0, 10));
    await screen.findByText("gadget-master");

    // Nothing is searchable mid-stream: the field is locked and says why,
    // rather than answering a query over the partial registry.
    const input = screen.getByLabelText("搜索 Skill");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "索引构建中…");

    // The stream completes, the search index builds over the full registry and
    // the field unlocks, with no user retry.
    harness.pushAll(gadgetRegistry().slice(10));
    harness.complete();
    await waitFor(() => expect(input).toBeEnabled());

    const user = userEvent.setup();
    // A half-typed word answers straight off the freshly built index.
    await user.type(input, "gadget-m");
    expect(
      await screen.findByRole("button", { name: "查看 gadget-master 详情" }),
    ).toBeInTheDocument();

    // A mistyped word is no longer rescued into a hit: the answer is the
    // no-match empty state, not a stale page one.
    await user.clear(input);
    await user.type(input, "gadgt");
    expect(
      await screen.findByText("未找到匹配“gadgt”的 Skill"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "查看 gadget-master 详情" }),
    ).not.toBeInTheDocument();
  });
});
