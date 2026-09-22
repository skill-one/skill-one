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
import {
  HashRouter,
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from "react-router";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { searchSkillsSh } from "../../lib/skills-sh";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { formatCount } from "../../lib/utils";
import type { SkillView } from "../../lib/skill-view";
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
  fetchSkillDetail: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);

/**
 * The live skills.sh search is stubbed at the module boundary: what the page
 * owes it is "ask once per search text, fold the answer in below the groups" —
 * the request itself is `lib/skills-sh.test.ts`'s subject. `isSearchableQuery`
 * stays real, so the endpoint's own query floor is exercised here too.
 */
vi.mock("../../lib/skills-sh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/skills-sh")>()),
  searchSkillsSh: vi.fn(),
}));

const mockSearchSkillsSh = vi.mocked(searchSkillsSh);

/** The one repository every `makeSkills` skill belongs to. */
const BATCH_REPO = "acme/batch";

/** A skill count past the page's first group chunk and past a card preview,
 * so tests can say "more than the page mounts at once". */
const STREAM_BATCH = 60;

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
    ...Array.from({ length: STREAM_BATCH + 10 }, (_, i) => ({
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

/**
 * One live skills.sh hit in the app's skill model: the shape `lib/skills-sh.ts`
 * maps the endpoint's answer to — a name, a source repo and an install count,
 * with no description, stars or snapshot path to go with them, and no index
 * entry to back them (`storeBacked`).
 */
function liveSkill(name: string, repo: string, downloads: number): SkillView {
  return {
    name,
    repo,
    description: "",
    stars: 0,
    downloads,
    url: `https://www.skills.sh/${repo}/${name}`,
    storeBacked: false,
  };
}

/**
 * The card element of one skill, addressed by its name. An indexed row names
 * itself for the detail panel it opens; a live row opens none, and the search
 * highlight may have split its name into several spans anyway, so that one is
 * addressed by its own text.
 */
function cardOf(name: string): HTMLElement {
  const card =
    screen.queryByRole("button", { name: `查看 ${name} 详情` }) ??
    screen.getByText(name);
  return card.closest('[data-slot="card"]') as HTMLElement;
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
 * Where a repository card's bar leads. The page itself is stood in for —
 * `repo-page.test.tsx` owns its behaviour — because what the drill-down tests
 * here is what the *list* keeps while it is away.
 */
function RepoStandIn() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      返回探索
    </button>
  );
}

/** The list under the routes a drill-down needs: the list, and a page to land
 *  on. A memory router, so a "back" is a pop of the entry the list is on. */
function renderExploreRoutes() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/explore"]}>
        <Routes>
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/repo/*" element={<RepoStandIn />} />
        </Routes>
      </MemoryRouter>
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
  // Default: the live source has nothing to add, so every test that does not
  // care about it sees the local answer alone.
  mockSearchSkillsSh.mockReset();
  mockSearchSkillsSh.mockResolvedValue([]);
  mockFetchSkillDetail.mockImplementation(
    async (_repo: string, id: string) => ({
      name: id,
      description: `Description of ${id}.`,
      instructions: `Instructions for ${id}.`,
      path: `skills/${id}/SKILL.md`,
    }),
  );
});

// Base UI's menus mount, position and exit asynchronously; under a loaded
// CI machine those steps can exceed the default 5s per test. Give the
// menu-driven interactions in this file more headroom.
vi.setConfig({ testTimeout: 15_000 });

describe("ExplorePage", () => {
  it("leads the repository view with one card per repository", async () => {
    bootRegistry(50);
    renderExplorePage();

    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    // One repository, one card: the group header the list used to lead with is
    // gone, because the card *is* the group. Its bottom bar is what signs the
    // card and what opens the repository's own page.
    expect(
      screen.getByRole("link", { name: `查看仓库 ${BATCH_REPO}，50 个 skill` }),
    ).toBeInTheDocument();
    // The page answered one RPC; browsing never re-downloads the registry.
    expect(harness.downloads).toBe(1);
  });

  it("caps a repository's rows and hands the rest to its page", async () => {
    // One repository with eight skills: seven on the card, one behind it.
    harness.init();
    harness.pushAll(makeSkills(8, 0));
    harness.complete();
    renderExplorePage();

    // The cap is what keeps one big repository from pushing every other card
    // off the screen; the bar carries the repository's *total*, so a capped list
    // reads as "these of them" and its door leads to all of them.
    expect(await screen.findByText("skill-6")).toBeInTheDocument();
    expect(screen.queryByText("skill-7")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `查看仓库 ${BATCH_REPO}，8 个 skill` }),
      // The app is a hash router, so the rendered href carries the hash.
    ).toHaveAttribute("href", `#/repo/${BATCH_REPO}`);
    expect(
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情/ }),
    ).toHaveLength(7);
  });

  it("switches to the category view, bucketing by classification", async () => {
    const user = userEvent.setup();
    const classify = (name: string, domain: string[], repo: string): Skill => ({
      name,
      repo,
      description: "",
      stars: 1_000,
      downloads: 1_000,
      path: `skills/${name}`,
      profile: { domain },
    });
    harness.init();
    harness.pushAll([
      classify("redis-clip", ["development"], "acme/a"),
      classify("redis-lab", ["development"], "acme/b"),
      classify("lint-fix", ["testing"], "acme/c"),
      // No profile: the dataset never classified it.
      {
        name: "orphan",
        repo: "acme/d",
        description: "",
        stars: 1,
        downloads: 1,
        path: "skills/orphan",
      },
    ]);
    harness.complete();
    renderExplorePage();

    // The browse list starts on the repository view: one card per repository.
    expect(
      await screen.findByRole("link", { name: "查看仓库 acme/a，1 个 skill" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "按分类" }));

    // The category view: one card per domain, its door leading to its page.
    expect(
      await screen.findByRole("link", { name: "查看分类 开发编程，2 个 skill" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "查看分类 测试与质量，1 个 skill" }),
    ).toBeInTheDocument();
    // The unclassified skill pools into the catch-all rather than vanishing.
    expect(
      screen.getByRole("link", { name: "查看分类 其他，1 个 skill" }),
    ).toBeInTheDocument();
    // The repository cards are gone: the two views are alternatives.
    expect(screen.queryByRole("link", { name: /^查看仓库 / })).toBeNull();
  });

  it("renders the leading cards first and reveals more as the reader scrolls", async () => {
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

    // The first chunk is mounted, cards and all. The count reads the head
    // link's exact aria-label shape — one per rendered repository card.
    const renderedCards = () =>
      screen
        .getAllByRole("link", { name: /^查看仓库 repo-\d+\/skills，/ }).length;
    expect(renderedCards()).toBe(6);
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
    await waitFor(() => expect(renderedCards()).toBe(12));
    expect(screen.getByText("skill-11")).toBeInTheDocument();

    // Once everything is mounted the sentinel is gone; a late trigger is a
    // no-op instead of an error.
    lastObserver().trigger(true);
    expect(renderedCards()).toBe(12);
  });

  it("keeps the reader's place across a repository's page and back", async () => {
    const user = userEvent.setup();
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
    const { container } = renderExploreRoutes();

    const renderedCards = () =>
      screen.getAllByRole("link", { name: /^查看仓库 repo-\d+\/skills，/ });
    const scroller = () =>
      (container.querySelector("ul.grid") as HTMLElement).closest(
        ".overflow-y-auto",
      ) as HTMLElement;
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    await screen.findByText("skill-0");
    expect(renderedCards()).toHaveLength(6);

    // The reader searches, scrolls the answer to its end — which reveals the
    // rest of it — and leaves the list sitting partway down.
    await user.type(await searchField(), "skill");
    await waitFor(() => expect(document.querySelector("mark")).toBeInTheDocument());
    lastObserver().trigger(true);
    await waitFor(() => expect(renderedCards()).toHaveLength(12));
    scroller().scrollTop = 300;
    fireEvent.scroll(scroller());

    // Into a repository's page, and back out of it.
    await user.click(renderedCards()[0]);
    await user.click(
      await screen.findByRole("button", { name: "返回探索" }),
    );

    // The reader is handed the page they left, not a reset one: their search,
    // the depth they had revealed, and the position they were scrolled to.
    expect(await screen.findByRole("textbox", { name: "搜索 Skill" })).toHaveValue(
      "skill",
    );
    expect(renderedCards()).toHaveLength(12);
    expect(scroller().scrollTop).toBe(300);
  }, 15000);

  it("shows a repository's stars and skill count on its card", async () => {
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

    // The most-starred repository leads the list.
    expect(await screen.findByText("widget-core")).toBeInTheDocument();
    const bar = screen.getByRole("link", {
      name: "查看仓库 acme/widgets，2 个 skill",
    });
    // The figures a group header used to carry now ride the card's bottom bar:
    // the repository's name, the stars compactly right behind it — where they
    // say something about the repository — and the skill count, the
    // repository's total, inside the label of the door at the far end.
    expect(within(bar).getByText("acme/widgets")).toBeInTheDocument();
    expect(
      within(bar).getByText(new RegExp(formatCount(12_300))),
    ).toBeInTheDocument();
    expect(within(bar).getByText("2 个 skill")).toBeInTheDocument();
    // Both of the repository's rows are inside the card.
    expect(
      screen.getByRole("button", { name: "查看 widget-core 详情" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看 widget-cli 详情" }),
    ).toBeInTheDocument();
  });

  it("orders repositories by stars and a repository's skills by installs", async () => {
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

    // The grouped list puts the starred repository first — even though its
    // skills are far less installed — and orders the group's own cards by
    // installs (b2's installs beat b1's). A group's stars, not a lone
    // skill's installs, decide the group's place.
    expect(cardOrder()).toEqual(["b2", "b1", "n1"]);
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

    // The count reads the head link's exact aria-label shape — one per
    // rendered repository card.
    const renderedGadgetCards = () =>
      screen.getAllByRole("link", {
        name: /^查看仓库 acme\/gadget-\d+，/,
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
      expect(renderedGadgetCards()).toHaveLength(12),
    );

    // A new answer restarts the run at the first chunk — it must not inherit
    // the scrolled depth of the list it replaces. The reset lands with the
    // keystroke; the search answer lands one debounce later, so both halves
    // wait.
    await user.type(await searchField(), "gadget");
    // The search answer is the same twelve gadgets, so six visible cards alone
    // cannot tell pre- from post-search: the pre-search list also shows six. Wait
    // for the highlight the applied query paints on every match, then for the six
    // cards, so the scroll below fires the observer the *new* answer mounted —
    // not a stale one left over from before the keystroke (which the transient
    // empty answer had already disconnected).
    await waitFor(() => {
      expect(renderedGadgetCards()).toHaveLength(6);
      expect(document.querySelector("mark")).toBeInTheDocument();
    });

    // And scrolling the new answer reveals the rest of it.
    lastObserver().trigger(true);
    await waitFor(() => expect(renderedGadgetCards()).toHaveLength(12));
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

  it("closes the list with the live skills.sh answer, minus what the index has", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    // The endpoint answers with one skill the index already carries (the row
    // the local search just found) and one it does not.
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("gadget-master", "acme/gadgets", 99),
      liveSkill("sprocket", "acme/fresh", 7),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    expect(
      await screen.findByRole("button", {
        name: "分组 skills.sh 官方搜索，1 个 skill",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("实时结果，本地索引未收录")).toBeInTheDocument();
    // The live-only skill is on the page…
    expect(screen.getByText("sprocket")).toBeInTheDocument();
    expect(screen.getByText("acme/fresh")).toBeInTheDocument();
    // …and the indexed copy is still the only gadget-master: a live hit the
    // local answer already covers is not a second row.
    expect(
      screen.getAllByRole("button", { name: "查看 gadget-master 详情" }),
    ).toHaveLength(1);
    expect(mockSearchSkillsSh).toHaveBeenCalledWith("gadget", expect.anything());
  });

  it("shows no figure on a live row, which has no index entry to take one from", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 199323),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");
    await screen.findByText("sprocket");

    // The endpoint's rows carry no classification, so the card draws facts
    // only for rows the store vouches for: a live row shows no figure even
    // though the endpoint publishes an install count for it. Its rail is not
    // blank — it still names the source.
    const live = cardOf("sprocket");
    expect(live).toHaveTextContent("acme/fresh");
    expect(live.querySelector('[title$="次安装"]')).toBeNull();
    // The indexed skill is on the page beside it, as a repository card's row:
    // that surface prints no per-skill figure either (the figure belongs to the
    // standalone skill card — see skill-list-row.test.tsx), so what this test
    // pins is that the live row asks for nothing it cannot have.
    expect(
      screen.getByRole("button", { name: "查看 gadget-master 详情" }),
    ).toBeInTheDocument();
  });

  it("shows the live answer when the local index has no match", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([liveSkill("sprocket", "acme/fresh", 7)]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "sprocket");

    expect(
      await screen.findByRole("button", {
        name: "分组 skills.sh 官方搜索，1 个 skill",
      }),
    ).toBeInTheDocument();
    // The live answer replaces the empty state rather than sitting behind it.
    expect(screen.queryByText(/未找到匹配/)).not.toBeInTheDocument();
  });

  it("asks the live endpoint only once the query clears its floor", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    // Browsing is not a search: with no query there is nothing to ask.
    expect(mockSearchSkillsSh).not.toHaveBeenCalled();

    await user.type(await searchField(), "g");
    // The one-character query has settled locally — the filler groups are
    // gone — while the endpoint, which answers nothing shorter than two
    // characters, was never asked.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^分组 acme\/tool-/ }),
      ).not.toBeInTheDocument(),
    );
    expect(mockSearchSkillsSh).not.toHaveBeenCalled();
  });

  it("searches the name only: repo and description mentions are not hits", async () => {
    const user = userEvent.setup();
    // Only the first skill is named for "widget"; the second carries it in its
    // repository (acme/widget-lab) and the third in its description, and
    // neither is searched.
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

    // Rows appear in DOM order; read each row's aria-label, which stays intact
    // even when a highlighted name is split across <mark> segments. The
    // browsed list also shows all three, so the assertion must wait out the
    // swap rather than trust the first paint.
    await waitFor(() => expect(cardOrder()).toEqual(["widget-pack"]));
  });

  it("ranks search results by install count among equally relevant matches", async () => {
    const user = userEvent.setup();
    // Registry order: ["alpha-redis-clip", "beta-redis-tool"] — the opposite
    // of the install order.
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

    // Both matches are equally relevant, so installs put the more installed
    // one first — a reorder the browsed list's order alone cannot explain,
    // which is also the proof that a search answers in relevance order rather
    // than in the order the browsed list had.
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

    // The name's matched token is wrapped in a <mark>; the name stays one
    // logical string across the highlight segments, so the row still reads —
    // and is still addressed as — the whole of it.
    const mark = await screen.findByText("gadget");
    expect(mark.tagName).toBe("MARK");
    expect(
      screen.getByRole("button", { name: "查看 gadget-master 详情" }),
    ).toHaveTextContent("gadget-master");
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
    await user.click(document.querySelector('[data-slot="sheet-overlay"]')!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // Escape also closes the panel (the sheet's document-level dismiss).
    await user.click(screen.getByText("skill-1"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("opens the drawer without reflowing the card list", async () => {
    const user = userEvent.setup();
    bootRegistry(50);
    const { container } = renderExplorePage();
    await screen.findByText("skill-0");

    const list = container.querySelector("ul.grid")!;
    expect(list.className).toContain(REPO_LIST_CLASS);
    // One repository card in the list, seven rows in the card: the list run is
    // the cap, not the full 50-skill repository.
    expect(list.children).toHaveLength(1);
    expect(list.querySelectorAll("li li")).toHaveLength(7);

    // Opening the drawer overlays the list: its classes — and with them its
    // layout and scroll position — stay exactly the same while the drawer is
    // open and after it closes.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(list.className).toContain(REPO_LIST_CLASS);

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(list.className).toContain(REPO_LIST_CLASS);
    expect(list.children).toHaveLength(1);
    expect(list.querySelectorAll("li li")).toHaveLength(7);
  });
});

describe("ExplorePage streaming", () => {
  it("paints a skeleton list while the first snapshot is still in flight", async () => {
    harness.init();
    const { container } = renderExplorePage();
    await act(async () => {});

    // The switch is instant: repository-card-shaped skeletons fill the list
    // instead of a spinner, and no card is rendered from nothing.
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons).toHaveLength(12);
    expect(skeletons[0]).toHaveClass(REPO_CARD_SKELETON_CLASS);
    expect(screen.queryByText("skill-0")).not.toBeInTheDocument();

    // The first streamed batch replaces the skeleton with real cards.
    harness.pushAll(makeSkills(3, 0));
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("renders cards from progress snapshots while the index is still streaming", async () => {
    harness.init();
    renderExplorePage();
    await act(async () => {});

    harness.pushAll(makeSkills(STREAM_BATCH + 5, 0));

    // The card paints from the partial data (its seven rows, then the tail) and
    // grows in place as more of the stream lands, without disturbing the card
    // the reader already has open.
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-3")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: `查看仓库 ${BATCH_REPO}，${STREAM_BATCH + 5} 个 skill`,
      }),
    ).toBeInTheDocument();

    harness.pushAll(makeSkills(STREAM_BATCH + 20, 0).slice(STREAM_BATCH + 5));
    // The refetch over the grown prefix updates the card's count in place;
    // wait it out rather than racing the swap.
    await waitFor(() =>
      expect(
        screen.getByRole("link", {
          name: `查看仓库 ${BATCH_REPO}，${STREAM_BATCH + 20} 个 skill`,
        }),
      ).toBeInTheDocument(),
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
