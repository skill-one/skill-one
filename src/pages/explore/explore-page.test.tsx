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

import { AppHeader } from "../../components/app-header";

import {
  fetchSkillDetail,
  fetchSkillZhDetail,
} from "../../lib/skill-detail-api";
import { searchSkillsSh } from "../../lib/skills-sh";
import { getListView, resetListView, setUnit } from "../../lib/list-view";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { formatCount } from "../../lib/utils";
import { I18nProvider } from "../../i18n/language-provider";
import type { SkillView } from "../../lib/skill-view";
import type { Skill } from "../../types/skill";
import type { RegistryHarness } from "../../test/registry-harness";
import {
  installMockSkill,
  resetMockInstalledSkills,
} from "../../lib/mock-local";
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
 * including streaming progress and the ready-epoch invalidation.
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
  // The drawer probes the snapshot's Chinese page (in the suite's pinned zh
  // locale) before it can decide which body leads; the null answer is a
  // skill without a translation, which hands the body to the English fetch.
  fetchSkillZhDetail: vi.fn(),
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
 * The list's own field, once the worker's index is ready to answer it. The store's
 * field stays locked until then, so every search case waits for the same unlock
 * instead of racing the index build.
 */
async function searchField(): Promise<HTMLElement> {
  const input = screen.getByRole("textbox", { name: "搜索 Skill" });
  await waitFor(() => expect(input).toBeEnabled());
  return input;
}

/**
 * The live skills.sh group — the third source the search answer is read in.
 * It is asked for as the query settles and open by default, so there is no
 * press to simulate: these cases only wait for it to land.
 */
const liveAnswer = async () => screen.findByRole("region", { name: "skills.sh 官方搜索" });

/**
 * Whether a full-height empty state is on screen. A page that answers a search
 * with one above live results is claiming "nothing here" over a page full of
 * something, so this is asserted by the state's own hook rather than by the
 * wording it happens to use this week.
 */
const fullPageEmptyState = () => document.querySelector('[data-slot="placeholder"]');

let queryClient: QueryClient;

function renderExplorePage() {
  // The app's own router, hash and all: the header reads the current list off
  // the path, and the links it wraps carry the hash prefix the app renders.
  window.location.hash = "#/explore";
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {/* The real app mounts pages inside the shell, the header above them.
            The list's own controls — the shape switch, the domain picker, the
            sort switch — stand on the page's first row and render with it. The
            search field is not among them: it lives in the chrome, since it
            answers on every route (see `list-toolbar.tsx`). */}
        <HashRouter>
          <AppHeader />
          <ExplorePage />
        </HashRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

/** Cards in DOM order, named by their stable aria-label. */
const cardOrder = () =>
  screen
    .getAllByRole("button", { name: /查看 .+ 详情/ })
    .map((el) => el.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""));

/**
 * The figure each mounted card's bar leads with, in DOM order: the card's own
 * place in the list. Read by *position* — the first thing in the bar's identity —
 * because that is the claim being made about it, and because a card that states
 * no place then reads as the empty face slot rather than as a number.
 */
const cardOrdinals = (scope: ParentNode = document.body) =>
  Array.from(
    scope.querySelectorAll('[data-slot="card"][data-repo]'),
  ).map(
    (card) =>
      card
        .querySelector('[data-slot="card-header"]')
        ?.firstElementChild?.firstElementChild?.textContent?.trim() ?? "",
  );

/** The repository cards mounted under a scope, by the `data-repo` each Card
 *  carries — the stable fact every card has, expandable or not. The default
 *  scope is the document body because the cards render inside the sheet's
 *  portal, which is a sibling of the render container rather than a descendant
 *  of it; a caller holding a container passes it when it knows the cards are
 *  still in the tree. */
const repoCards = (scope: ParentNode = document.body) =>
  scope.querySelectorAll('[data-slot="card"][data-repo]');

/**
 * Picks the shape the store list is read in: 列表 (one row per skill) or 卡片
 * (one card per repository). The pair stands on the row itself, so this is one
 * press on a named toggle and no popup to open.
 */
async function pickUnit(
  user: ReturnType<typeof userEvent.setup>,
  shape: "列表" | "卡片",
) {
  await user.click(screen.getByRole("button", { name: shape }));
}

/**
 * Picks a domain scope from the 分类 picker. `label` names the menu item —
 * 全部 or a domain's display label. The popup closes on the pick, so each
 * scope change reopens it.
 */
async function pickDomain(
  user: ReturnType<typeof userEvent.setup>,
  label: string | RegExp,
) {
  await user.click(
    await screen.findByRole("button", { name: "分类" }),
  );
  await user.click(await screen.findByRole("menuitemradio", { name: label }));
}

/**
 * Opens the 分类 picker without picking, to read its menu of scopes; the
 * popup mounts asynchronously, so the caller's queries can be synchronous.
 */
async function openDomainSelect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "分类" }),
  );
  await screen.findByRole("menuitemradio", { name: /^全部/ });
}

beforeEach(() => {
  // Fresh cache per test; retries are off so a rejected fetch surfaces an
  // error state immediately instead of being retried silently.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10 * 60 * 1000, retry: false } },
  });
  harness.reset();
  // The list's question, shape and scope are module state that outlives the
  // page, so each case starts from a list that asks nothing.
  resetListView();
  // The unified search view reads the installed list; the mock store's
  // installs must not leak from one test's answer into the next one's.
  resetMockInstalledSkills();
  mockFetchSkillDetail.mockReset();
  // Default: the live source has nothing to add, so every test that does not
  // care about it sees the local answer alone.
  mockSearchSkillsSh.mockReset();
  mockSearchSkillsSh.mockResolvedValue([]);
  // No fixture skill ships a Chinese page, so the drawer's zh probe answers
  // null and the English body leads.
  vi.mocked(fetchSkillZhDetail).mockReset();
  vi.mocked(fetchSkillZhDetail).mockResolvedValue(null);
  // The app's default reading is the popularity rows, but most tests here read
  // the store list as repository cards — the reading they were written
  // against; the ones that want the other reading pick the shape themselves.
  setUnit("store", "repo");
  mockFetchSkillDetail.mockImplementation(
    async (_repo: string, id: string) => ({
      description: `Description of ${id}.`,
      instructions: `Instructions for ${id}.`,
      path: `skills/${id}/SKILL.md`,
    }),
  );
});

// Base UI's popups mount, position and exit asynchronously; under a loaded
// CI machine those steps can exceed the default 5s per test. Give the
// popup-driven interactions in this file more headroom.
describe("ExplorePage", () => {
  it("keeps the domain picker in the content, not in the header", async () => {
    bootRegistry(4);
    renderExplorePage();

    const picker = await screen.findByRole("button", { name: "分类" });
    // It narrows the list it sits on, so it opens the list's own content
    // rather than sharing the shell's row with the controls both lists use.
    expect(screen.queryByRole("banner")?.contains(picker)).toBe(false);
  });

  it("leads the repository view with one card per repository", async () => {
    bootRegistry(50);
    renderExplorePage();

    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    // One repository, one card: the group header the list used to lead with is
    // gone, because the card *is* the group. Its bottom bar is what signs the
    // card — and with fifty skills behind the cap, what expands it in place.
    expect(
      screen.getByRole("button", {
        name: `展开 ${BATCH_REPO} 的全部 50 个 skill`,
      }),
    ).toBeInTheDocument();
    // The page answered one RPC; browsing never re-downloads the registry.
    expect(harness.downloads).toBe(1);
  });

  /**
   * Two single-skill repositories whose stars and installs disagree: `few` is
   * the most installed, `star` the most starred. A shape that ordered by the
   * wrong figure puts them in opposite orders, so each arrangement can be told
   * apart from the other by the order alone.
   */
  function bootRankedRegistry() {
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "few",
        repo: "acme/quiet",
        description: "",
        stars: 50,
        downloads: 10,
        path: "skills/few",
      },
      {
        name: "star",
        repo: "acme/loud",
        description: "",
        stars: 500,
        downloads: 5,
        path: "skills/star",
      },
    ]);
    harness.complete();
  }

  it("offers no sort control, because the store has only one order", async () => {
    bootRankedRegistry();
    renderExplorePage();
    await screen.findByText("few");

    // The store's only order is the figure its own rows display, so it has no
    // order control to press — what it has instead is the shape, and both of
    // its arrangements stand on the row.
    expect(
      screen.queryByRole("button", { name: "排序方式" }),
    ).not.toBeInTheDocument();
  });

  it("orders the row shape by install count, most installed first", async () => {
    const user = userEvent.setup();
    bootRankedRegistry();
    renderExplorePage();
    await screen.findByText("few");

    await pickUnit(user, "列表");

    // 列表 is one row per skill, most installed first — the figure each row
    // shows, so the order and the numbers beside it cannot disagree.
    await waitFor(() => expect(cardOrder()).toEqual(["few", "star"]));
  });

  it("orders the card shape by stars, most-starred repository first", async () => {
    const user = userEvent.setup();
    bootRankedRegistry();
    renderExplorePage();
    await screen.findByText("few");

    await pickUnit(user, "卡片");

    // 卡片 is one card per repository, led by the most-starred one — however
    // few installs its skills claim, which is the opposite of the row order.
    await waitFor(() => expect(cardOrder()).toEqual(["star", "few"]));
    expect(repoCards()).toHaveLength(2);
  });

  it("states each card's own place in the stack, in the order it is read", async () => {
    const user = userEvent.setup();
    bootRankedRegistry();
    renderExplorePage();
    await screen.findByText("few");

    await pickUnit(user, "卡片");

    // The cards take the whole row each, so the figure column the row shape's
    // ordinals make is available here too — and it counts the order the reader is
    // actually in, which is the stars the leading card prints. The number leads
    // the bar, ahead of the face, so a scan down the stack gets the shape of the
    // answer before it reads a single name.
    await waitFor(() => expect(cardOrdinals()).toEqual(["1", "2"]));
  });

  it("remembers the chosen shape after the page goes away", async () => {
    const user = userEvent.setup();
    bootRankedRegistry();
    const { unmount } = renderExplorePage();
    await screen.findByText("few");

    await pickUnit(user, "列表");
    await waitFor(() => expect(cardOrder()).toEqual(["few", "star"]));

    // The choice lives in the shared view, so it survives the page going away.
    unmount();
    renderExplorePage();

    expect(await screen.findByRole("button", { name: "列表" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("caps a repository's rows at the folded limit and reveals the rest in place", async () => {
    const user = userEvent.setup();
    // One repository with twelve skills: ten on the card (five rows of the
    // two-column body), two behind the cap.
    harness.init();
    harness.pushAll(makeSkills(12, 0));
    harness.complete();
    renderExplorePage();

    // The cap is what keeps one big repository from running the whole screen;
    // the bar carries the *increment*, so a capped list reads as "these of
    // them" — and the rest is one press away in place.
    expect(await screen.findByText("skill-9")).toBeInTheDocument();
    expect(screen.queryByText("skill-10")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情/ }),
    ).toHaveLength(10);
    await user.click(
      screen.getByRole("button", {
        name: `展开 ${BATCH_REPO} 的全部 12 个 skill`,
      }),
    );
    expect(
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情/ }),
    ).toHaveLength(12);
  });

  it("scopes the browse list to one domain when it is picked", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "redis",
        repo: "acme/dev",
        description: "",
        stars: 300,
        downloads: 300,
        path: "skills/redis",
        profile: { domain: ["development"] },
      },
      {
        name: "lint",
        repo: "acme/test",
        description: "",
        stars: 200,
        downloads: 200,
        path: "skills/lint",
        profile: { domain: ["testing"] },
      },
      {
        name: "orphan",
        repo: "acme/misc",
        description: "",
        stars: 100,
        downloads: 100,
        path: "skills/orphan",
      },
    ]);
    harness.complete();
    const { container } = renderExplorePage();

    // The list opens on 全部: one card per repository, and an option for
    // every domain that holds one — plus 未分类 for the repository nothing
    // classified, which is a different claim from the dataset's own 其他 and
    // so takes an item of its own.
    const cards = () => repoCards(container);
    await screen.findByText("redis");
    expect(cards()).toHaveLength(3);
    expect(screen.getByRole("button", { name: "分类" })).toHaveTextContent(
      "3",
    );
    await openDomainSelect(user);
    expect(
      screen.getByRole("menuitemradio", { name: /开发编程/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /测试与质量/ }),
    ).toBeInTheDocument();
    const unclassified = screen.getByRole("menuitemradio", {
      name: /^未分类/,
    });
    expect(unclassified).toHaveTextContent("❓");
    expect(screen.queryByRole("menuitemradio", { name: /^其他/ })).toBeNull();

    // Picking a domain scopes the list to its repositories alone.
    await user.click(screen.getByRole("menuitemradio", { name: /开发编程/ }));
    await waitFor(() =>
      expect(screen.queryByText("lint")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("redis")).toBeInTheDocument();
    expect(screen.queryByText("orphan")).not.toBeInTheDocument();
    expect(cards()).toHaveLength(1);

    // The 未分类 item scopes to the repository no classification covers.
    await pickDomain(user, /^未分类/);
    await waitFor(() =>
      expect(screen.queryByText("redis")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("orphan")).toBeInTheDocument();
    expect(cards()).toHaveLength(1);

    // 全部 clears the scope again.
    await pickDomain(user, /^全部/);
    expect(await screen.findByText("lint")).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });

  it("keeps the dataset's 其他 apart from what nothing classified", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "stray",
        repo: "acme/stray",
        description: "",
        stars: 200,
        downloads: 200,
        path: "skills/stray",
        // The dataset looked and answered "none of these fit".
        profile: { domain: ["other"] },
      },
      {
        name: "orphan",
        repo: "acme/orphan",
        description: "",
        stars: 100,
        downloads: 100,
        path: "skills/orphan",
        // Nobody classified it at all.
      },
    ]);
    harness.complete();
    renderExplorePage();

    // An answer and a blank, told apart in the picker: the leftovers box for
    // 其他, the question mark for 未分类, each counting its own.
    await openDomainSelect(user);
    const other = screen.getByRole("menuitemradio", { name: /^其他/ });
    const unclassified = screen.getByRole("menuitemradio", {
      name: /^未分类/,
    });
    expect(other).toHaveTextContent("📦");
    expect(unclassified).toHaveTextContent("❓");
    expect(other).toHaveTextContent("1");
    expect(unclassified).toHaveTextContent("1");
    await user.keyboard("{Escape}");

    // The repository unit's card rows mark them the same way …
    const strayCardRow = screen.getByRole("button", {
      name: "查看 stray 详情",
    });
    expect(strayCardRow).toHaveTextContent("📦");
    const orphanCardRow = screen.getByRole("button", {
      name: "查看 orphan 详情",
    });
    expect(orphanCardRow).toHaveTextContent("❓");

    // … and so do the skill unit's rows, which share the resolver.
    await pickUnit(user, "列表");
    const strayRow = await screen.findByRole("button", {
      name: "查看 stray 详情",
    });
    expect(strayRow).toHaveTextContent("📦");
    expect(
      screen.getByRole("button", { name: "查看 orphan 详情" }),
    ).toHaveTextContent("❓");
  });

  it("lists skills by install count, one row per skill", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "r1",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 50,
        path: "skills/r1",
      },
      {
        name: "r2",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 40,
        path: "skills/r2",
      },
      {
        name: "r3",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 30,
        path: "skills/r3",
      },
      {
        name: "z1",
        repo: "o/two",
        description: "",
        stars: 10,
        downloads: 20,
        path: "skills/z1",
      },
    ]);
    harness.complete();
    const { container } = renderExplorePage();

    // The repository unit leads with one card per repository...
    await screen.findByText("o/one");
    await pickUnit(user, "列表");

    // ...and the skill unit with one row per skill, most installed first.
    // A source's several skills each keep their own row.
    await waitFor(() => expect(cardOrder()).toEqual(["r1", "r2", "r3", "z1"]));
    expect(repoCards(container).length).toBe(0);
    // Each row keeps only its source's owner face — the repo path itself is gone.
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(4);
  });

  it("keeps a prolific repository's rows flat instead of folding them", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "r1",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 50,
        path: "skills/r1",
      },
      {
        name: "r2",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 40,
        path: "skills/r2",
      },
      {
        name: "r3",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 30,
        path: "skills/r3",
      },
      {
        name: "r4",
        repo: "o/one",
        description: "",
        stars: 10,
        downloads: 20,
        path: "skills/r4",
      },
      {
        name: "z1",
        repo: "o/two",
        description: "",
        stars: 10,
        downloads: 10,
        path: "skills/z1",
      },
    ]);
    harness.complete();
    renderExplorePage();

    await pickUnit(user, "列表");
    await waitFor(() =>
      expect(cardOrder()).toEqual(["r1", "r2", "r3", "r4", "z1"]),
    );
    // No fold row stands in for a source's back catalogue: every skill of the
    // run is listed, each as its own row.
    expect(
      screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
    ).toBeNull();
  });

  it("files skills by their own domain in the skill unit", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "alpha",
        repo: "o/dev",
        description: "",
        stars: 10,
        downloads: 50,
        path: "skills/alpha",
        profile: { domain: ["development"] },
      },
      {
        name: "beta",
        repo: "o/dev",
        description: "",
        stars: 10,
        downloads: 40,
        path: "skills/beta",
        profile: { domain: ["development", "testing"] },
      },
      {
        name: "gamma",
        repo: "o/mix",
        description: "",
        stars: 10,
        downloads: 30,
        path: "skills/gamma",
        profile: { domain: ["testing"] },
      },
      {
        name: "delta",
        repo: "o/none",
        description: "",
        stars: 10,
        downloads: 20,
        path: "skills/delta",
      },
    ]);
    harness.complete();
    renderExplorePage();

    await pickUnit(user, "列表");
    await waitFor(() =>
      expect(cardOrder()).toEqual(["alpha", "beta", "gamma", "delta"]),
    );

    // The picker counts skills, not repositories: `beta` answers both domains,
    // so testing holds two while no repository leads with it.
    await openDomainSelect(user);
    const testing = screen.getByRole("menuitemradio", {
      name: /^测试与质量/,
    });
    expect(testing).toHaveTextContent("2");

    // Scoping to testing keeps every skill that belongs to it — including the
    // one whose repository leads elsewhere.
    await user.click(testing);
    await waitFor(() => expect(cardOrder()).toEqual(["beta", "gamma"]));
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

    // The first chunk is mounted, cards and all — one per rendered repository.
    const renderedCards = () => repoCards().length;
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

  it("keeps a long repository answer one flat grid, revealed to the end", async () => {
    // The gadget registry is one skill per repository: 71 repositories. The
    // answer is one flat grid in the ranking `byRepoRank` defines — no band
    // headers over it — and the reveal paces that grid: the first chunk mounts
    // with the page, scrolling to the sentinel mounts the rest.
    bootGadgetRegistry();
    const { container } = renderExplorePage();

    const cardCount = () => repoCards().length;
    const triggerSentinel = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances
        .at(-1)
        ?.trigger(true);

    // Only the first chunk mounts at first, in one flat grid.
    await screen.findByText("gadget-master");
    expect(cardCount()).toBe(6);
    expect(container.querySelector("ul.grid")).toBeInTheDocument();
    // No group sections anywhere: the ranking is the only order. Scoped to the
    // render, so a section appearing outside it would not slip past.
    expect(container.querySelector("section[aria-label]")).toBeNull();

    // Revealing to the bottom mounts every card, keeping each one once.
    await waitFor(() => {
      triggerSentinel();
      expect(cardCount()).toBe(71);
    });
  });

  it("shows a repository's stars on its card", async () => {
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
    const bar = cardOf("widget-core").querySelector(
      '[data-slot="card-header"]',
    ) as HTMLElement;
    // The figures a group header used to carry now ride the card's top bar:
    // the repository's name, and the stars compactly right behind it — where
    // they say something about the repository. Both rows are already on
    // screen, so no figure joins them: a count would answer a question the
    // card no longer asks.
    expect(within(bar).getByText("acme/widgets")).toBeInTheDocument();
    expect(
      within(bar).getByText(new RegExp(formatCount(12_300))),
    ).toBeInTheDocument();
    expect(within(bar).queryByText(/个 skill/)).toBeNull();
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
    // The overlay is portalled out of the render container, so reaching it
    // takes `baseElement`.
    const { baseElement } = renderExplorePage();
    await screen.findByText("skill-0");

    // Clicking the overlay closes the drawer.
    await user.click(screen.getByText("skill-0"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(baseElement.querySelector('[data-slot="sheet-overlay"]')!);
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

    const list = container.querySelector("ul.flex")!;
    expect(list.className).toContain(REPO_LIST_CLASS);
    // One repository card in the list, ten rows in the card: the list run is
    // the folded cap, not the full 50-skill repository.
    expect(list.children).toHaveLength(1);
    expect(list.querySelectorAll("li li")).toHaveLength(10);

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
    expect(list.querySelectorAll("li li")).toHaveLength(10);
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

    // The card paints from the partial data (its capped rows, then the tail) and
    // grows in place as more of the stream lands, without disturbing the card
    // the reader already has open. Sixty-five skills stream in; the folded cap
    // holds ten of them and the bar's offer accounts for the rest.
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-9")).toBeInTheDocument();
    expect(screen.queryByText("skill-10")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `展开 ${BATCH_REPO} 的全部 ${STREAM_BATCH + 5} 个 skill`,
      }),
    ).toBeInTheDocument();

    harness.pushAll(makeSkills(STREAM_BATCH + 20, 0).slice(STREAM_BATCH + 5));
    // The refetch over the grown prefix updates the card's count in place;
    // wait it out rather than racing the swap.
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: `展开 ${BATCH_REPO} 的全部 ${STREAM_BATCH + 20} 个 skill`,
        }),
      ).toBeInTheDocument(),
    );
  });
});

/**
 * The list's own question, asked from its own first row: what the reader is
 * looking for, and the three layers its answer arrives in — the registry index
 * (this list's own source), skills.sh behind a press, and nothing else.
 */
describe("ExplorePage search", () => {
  /** Cards of one source prefix, by the `data-repo` each card carries. */
  const cardsOf = (prefix: string) =>
    Array.from(repoCards()).filter((card) =>
      card.getAttribute("data-repo")?.startsWith(prefix),
    );

  it("lets a search ignore the domain filter", async () => {
    const user = userEvent.setup();
    harness.reset();
    harness.init();
    harness.pushAll([
      {
        name: "redis",
        repo: "acme/dev",
        description: "",
        stars: 300,
        downloads: 300,
        path: "skills/redis",
        profile: { domain: ["development"] },
      },
      {
        name: "lint",
        repo: "acme/test",
        description: "",
        stars: 200,
        downloads: 200,
        path: "skills/lint",
        profile: { domain: ["testing"] },
      },
    ]);
    harness.complete();
    renderExplorePage();

    // Scope the browse list to one domain...
    await pickDomain(user, /开发编程/);
    await waitFor(() =>
      expect(screen.queryByText("lint")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("redis")).toBeInTheDocument();

    // ...then search: the query re-answers across the whole registry, so the
    // filtered-out domain's skill comes back — which is also why the picker
    // stands down instead of narrowing an answer that ignores it.
    await user.type(await searchField(), "lint");
    expect(
      await screen.findByRole("button", { name: "查看 lint 详情" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分类" })).toBeDisabled();
  });

  it("answers a search with skill rows in the skill unit", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();

    await pickUnit(user, "列表");
    await user.type(await searchField(), "gadget");

    // The match comes back as a skill row rather than a repository card: the
    // shape stays open under a live question, because relevance ranks the same
    // entries either way round.
    expect(
      await screen.findByRole("button", { name: "查看 gadget-master 详情" }),
    ).toBeInTheDocument();
    expect(repoCards().length).toBe(0);
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
      // No filler repository survives the search.
      expect(cardsOf("acme/tool-")).toHaveLength(0);
    });
  });

  it("gives a search its own reveal, independent of how deep the browse list was read", async () => {
    const user = userEvent.setup();
    // Twelve one-skill "gadget" repositories: every one of them matches the
    // search, so the search answer alone is a whole chunk of its own.
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

    // The reader has scrolled: the browsed list is fully mounted (the reveal
    // paces the browse answer).
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    lastObserver().trigger(true);
    await waitFor(() => expect(cardsOf("acme/gadget-")).toHaveLength(12));

    // A search is revealed by its own hand, not by the browse list's: the depth
    // this list had been read to describes the browse answer and says nothing
    // about a question asked after it. Twelve cards is one whole chunk, so the
    // answer below is whole — and it got there by its own reveal, not by the
    // browse list happening to have been read to exactly twelve as well.
    await user.type(await searchField(), "gadget");
    await waitFor(() => {
      expect(cardsOf("acme/gadget-")).toHaveLength(12);
      expect(document.querySelector("mark")).toBeInTheDocument();
    });
  });

  it("reveals a search answer past its first chunk as the reader reaches its end", async () => {
    const user = userEvent.setup();
    // Twenty one-skill "widget" repositories. A broad word over the real
    // registry — thousands of entries, indexed for prefixes — matches far more
    // than any screen holds, and mounting all of it at once is a stall the
    // reader reads as the app having hung. So the answer starts arriving
    // immediately and finishes as it is read: nothing is withheld, it simply
    // does not all arrive at once.
    harness.init();
    harness.pushAll(
      Array.from({ length: 20 }, (_, i) => ({
        name: `widget-${String(i).padStart(2, "0")}`,
        repo: `acme/widget-${String(i).padStart(2, "0")}`,
        description: "A widget.",
        stars: 10,
        downloads: 10,
      })),
    );
    harness.complete();
    renderExplorePage();
    await screen.findByText("widget-00");

    await user.type(await searchField(), "widget");
    // One chunk is on screen and the rest has not arrived.
    await waitFor(() => expect(cardsOf("acme/widget-")).toHaveLength(12));
    expect(cardsOf("acme/widget-")).toHaveLength(12);

    // Reaching the end of what is mounted brings the next chunk — and then all
    // of it, since this answer is twenty cards and a chunk is twelve.
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    lastObserver().trigger(true);
    await waitFor(() => expect(cardsOf("acme/widget-")).toHaveLength(20));
  });

  it("restores the full registry when the search is cleared", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    const input = await searchField();
    await user.type(input, "gadget");
    await waitFor(() => expect(cardsOf("acme/tool-")).toHaveLength(0));

    await user.clear(input);

    expect(await screen.findByText("tool-0")).toBeInTheDocument();
  });

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

    // The search already cost the reader a query, so it also asked the live
    // source — no press stands between the question and its whole answer.
    expect(await screen.findByText("sprocket")).toBeInTheDocument();
    // The live answer is read in the unit the list is read in: repository cards
    // here, one per live repository (the covered hit's repository is gone with
    // it, so one remains).
    const live = await liveAnswer();
    expect(within(live).getByText("acme/fresh")).toBeInTheDocument();
    // The indexed copy is still the only gadget-master: a live hit the local
    // answer already covers is not a second row.
    expect(
      screen.getAllByRole("button", { name: "查看 gadget-master 详情" }),
    ).toHaveLength(1);
    expect(mockSearchSkillsSh).toHaveBeenCalledWith(
      "gadget",
      expect.anything(),
    );
  });

  it("shapes the live answer as repository cards whose bars are labels", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    // Two live hits share one repository; a third lives elsewhere; a fourth
    // sits under a bare discovery domain. The shared repository's card lists
    // its skills most-installed first — the order a repository card always
    // lists its rows in.
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
      liveSkill("cog", "acme/fresh", 9),
      liveSkill("gear", "acme/other", 3),
      liveSkill("orphan-skill", "smithery.ai", 1),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    // One card per live repository, all of them inside the live group, which
    // counts them: three repositories answered.
    expect(await screen.findByText("sprocket")).toBeInTheDocument();
    const live = await liveAnswer();
    expect(within(live).getByText("3 个仓库")).toBeInTheDocument();
    expect(repoCards(live)).toHaveLength(3);
    const fresh = document.querySelector('[data-repo="acme/fresh"]')!;
    expect(
      within(fresh as HTMLElement)
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((el) => el.getAttribute("aria-label")),
    ).toEqual(["查看 cog 详情", "查看 sprocket 详情"]);
    // A live row claims nothing its source does not carry: no 暂无描述
    // placeholder standing in for a description nobody published, and no
    // ❓ mark — nothing ever classified it, but nothing looked either.
    expect(within(fresh as HTMLElement).queryByText("暂无描述")).toBeNull();
    expect(fresh).not.toHaveTextContent("❓");
    // The bar still knows its owner: the face rides the label.
    expect(
      fresh.querySelector('[data-slot="card-header"] [data-slot="avatar"]'),
    ).not.toBeNull();
    // No card leads anywhere: a live card lists everything the endpoint
    // answered, so its bar is a label, and the indexed card's bar is too —
    // the rows are the only way out of any card.
    expect(
      Array.from(repoCards()).some((card) => card.querySelector("a")),
    ).toBe(false);
  });

  it("lists a live repository whole, uncapped under the search", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) =>
        liveSkill(`fresh-${i}`, "acme/fresh", 100 - i),
      ),
    );
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    // The live answer lands one request after the local one.
    await screen.findByText("fresh-0");
    const fresh = document.querySelector('[data-repo="acme/fresh"]')!;
    // A search's rows are matches: the card carries all seven, like the
    // indexed cards under the same query — nothing hidden behind a door.
    expect(
      within(fresh as HTMLElement).getAllByRole("button", {
        name: /查看 .+ 详情/,
      }),
    ).toHaveLength(7);
    expect(
      within(fresh as HTMLElement).getByText("fresh-6"),
    ).toBeInTheDocument();
    // A search's rows are matches, uncapped — every one of them is already on
    // screen, so the bar carries no figure.
    expect(within(fresh as HTMLElement).queryByText(/个 skill/)).toBeNull();
    // Uncapped is not unshaped: the card's body runs in two columns filled
    // row-major, the same layout the folded preview and the expansion use.
    const body = (fresh as HTMLElement).querySelector(
      '[data-slot="card-content"] ul',
    )!;
    expect(body).toHaveClass("grid-cols-2");
  });

  it("opens a live row on skills.sh instead of the detail panel", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
    ]);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");
    await user.click(await screen.findByText("sprocket"));
    expect(open).toHaveBeenCalledWith(
      "https://www.skills.sh/acme/fresh/sprocket",
      "_blank",
      "noopener,noreferrer",
    );
    // The drawer has nothing to show for a skill with no snapshot: it stays
    // closed — the browser, not the panel, is where the row's detail lives.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open.mockRestore();
  });

  it("shows no figure on a live row, which has no index entry to take one from", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 199323),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    // The skill unit's live row is the same full-width row the local list
    // uses (the repository unit renders live hits as repository-card rows,
    // which never draw a per-skill figure).
    await pickUnit(user, "列表");
    await user.type(await searchField(), "gadget");
    await screen.findByText("sprocket");

    // The endpoint's rows carry no classification, so the row draws facts
    // only for rows the store vouches for: a live row shows no figure even
    // though the endpoint publishes an install count for it. Its facts
    // cluster is not blank — it still shows the source's owner face.
    const live = cardOf("sprocket");
    expect(live.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(live.querySelector('[title$="次安装"]')).toBeNull();
    // The row states no description either — the endpoint publishes none,
    // so it claims none rather than a placeholder — and no classification
    // mark, which stays an empty slot.
    expect(live).not.toHaveTextContent("暂无描述");
    expect(live).not.toHaveTextContent("❓");
    // The indexed skill is on the page beside it, so what this test pins is
    // that the live row asks for nothing it cannot have.
    expect(
      screen.getByRole("button", { name: "查看 gadget-master 详情" }),
    ).toBeInTheDocument();
  });

  it("reads the live answer as rows of the list it closes, plainly enumerated", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
      liveSkill("gadget-pro", "acme/gadgets", 50),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await pickUnit(user, "列表");
    await user.type(await searchField(), "gadget");
    await screen.findByText("sprocket");

    const answer = await liveAnswer();
    // The live group's rows are the list's own full-width rows, not the card
    // grid a live section used to hold — one shape per unit, whichever answer
    // the rows belong to.
    expect(answer.querySelector("ul")).toHaveClass(SKILL_ROW_LIST_CLASS);
    // Enumerated, not ranked: the endpoint's relevance is no contest to
    // medal, so no live ordinal wears the podium ink the indexed rows above
    // carry.
    expect(answer.querySelector("span")!.className).not.toContain("amber");
    // The query's own terms highlight the live names, as they do the indexed
    // ones.
    expect(answer.querySelector("mark")).not.toBeNull();
    // Both live hits are here, and the group says how many: it is one source
    // among three, named and counted like any other.
    expect(
      within(answer).getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(2);
    expect(within(answer).getByText("2 个 skill")).toBeInTheDocument();
  });

  it("answers an empty store search from skills.sh, saying which source came up short", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "sprocket");

    // The store's index has nothing and says so in one quiet line — not with a
    // full-height empty state, which over a full page of results would be
    // claiming the page contradicts itself.
    expect(fullPageEmptyState()).toBeNull();
    expect(
      await screen.findByText("商店数据里还没有匹配“sprocket”的 Skill"),
    ).toBeInTheDocument();

    // The live answer is the whole answer, and it lands in the layout as a
    // group of its own rather than as a footnote under a verdict.
    expect(await screen.findByText("sprocket")).toBeInTheDocument();
    const live = await liveAnswer();
    expect(within(live).getByText("sprocket")).toBeInTheDocument();
    // The line sits in the slot the store's own group would have held, so the
    // scope change is stated where the reader looks for it.
    const note = screen.getByText("商店数据里还没有匹配“sprocket”的 Skill");
    expect(
      note.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // An empty group still renders nothing: the line is a statement about the
    // scope, not a header over an empty panel.
    expect(
      screen.queryByRole("region", { name: "应用商店" }),
    ).not.toBeInTheDocument();
  });

  it("states no matches only once every source has come back empty", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "sprocket");

    // Every source — the index and skills.sh — has answered, and none of them
    // has anything: now, and only now, is the empty state the search's verdict.
    // The quiet line stands down here, because this sentence already speaks for
    // the store's index too and one fact does not need saying twice.
    expect(
      await screen.findByText("未找到匹配“sprocket”的 Skill"),
    ).toBeInTheDocument();
    expect(fullPageEmptyState()).not.toBeNull();
    expect(
      screen.queryByText("商店数据里还没有匹配“sprocket”的 Skill"),
    ).not.toBeInTheDocument();
    expect(mockSearchSkillsSh).toHaveBeenCalledWith(
      "sprocket",
      expect.anything(),
    );
  });

  it("holds a searching state while the live answer is still in flight", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    // The live request holds its answer until the test lets go of it: the
    // window between the question settling and the rows arriving is exactly
    // where a "not found" would describe an answer that has not been given yet.
    let resolveLive: (hits: SkillView[]) => void = () => {};
    mockSearchSkillsSh.mockImplementation(
      () =>
        new Promise<SkillView[]>((resolve) => {
          resolveLive = resolve;
        }),
    );
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "sprocket");

    // The store's index has answered empty and left its quiet line; the live
    // group below is still the search's answer in progress, and no
    // full-height state claims otherwise over it.
    expect(fullPageEmptyState()).toBeNull();

    // The live group holds its place with a skeleton of the unit's own shape,
    // so the answer lands into the layout rather than onto it.
    const live = await liveAnswer();
    await waitFor(() =>
      expect(live.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
    // A group still answering counts nothing it does not have yet.
    expect(within(live).getByText("搜索中…")).toBeInTheDocument();

    // The answer lands and replaces the skeleton in place.
    resolveLive([liveSkill("sprocket", "acme/fresh", 7)]);
    expect(await screen.findByText("sprocket")).toBeInTheDocument();
  });

  it("answers a store search with the store's own group, then the live one", async () => {
    const user = userEvent.setup();
    // A store entry that matches and a live hit the index does not carry. The
    // same skill is installed on this machine too — a store answer is about
    // what can be installed, so the install is the store row's badge, not a
    // section of its own.
    installMockSkill("gadget-master");
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    // One group, named and counted — the store's own, which leads because it
    // is what this list is: the registry's daily snapshot.
    const own = await screen.findByRole("region", { name: "应用商店" });
    // The group counts what it holds, in the unit on screen — repositories
    // here, so repositories is what it says.
    expect(await within(own).findByText(/\d+ 个仓库/)).toBeInTheDocument();
    // No second store group: the installed copy is the store row's badge, and
    // the store page never opens a group for this machine's own records.
    expect(screen.getAllByRole("region", { name: "应用商店" })).toHaveLength(1);
    const live = await liveAnswer();
    // The order the reader reaches for them: the store's own answer first, the
    // way to skills.sh's below it.
    expect(
      own.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // It opens in place below — one card per live repository, and the card bars
    // stay clean: a one-skill card has nothing to offer, so no figure rides it.
    expect(within(live).getByText("acme/fresh")).toBeInTheDocument();
    expect(within(live).queryByText(/个 skill/)).toBeNull();
  });

  it("opens the drawer on the surface of the list that was searched", async () => {
    const user = userEvent.setup();
    // The store's own answer, opened from a store search: the drawer wears the
    // store surface, and its install CTA reads the persisted state — the skill
    // is on disk, so the store's own button is the installed badge. (The
    // installed surface is the other half of this, on the installed page.)
    installMockSkill("gadget-master");
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    await user.click(
      await screen.findByRole("button", { name: "查看 gadget-master 详情" }),
    );
    const storeDialog = await screen.findByRole("dialog");
    expect(
      await within(storeDialog).findByRole("button", { name: "已安装" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
  });

  it("asks the live endpoint only once the query clears its floor", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    // Browsing is not a search: with no query there is nothing to ask.
    expect(mockSearchSkillsSh).not.toHaveBeenCalled();

    await user.type(await searchField(), "g");
    // The one-character query has settled locally — the filler repositories are
    // gone — while the endpoint, which answers nothing shorter than two
    // characters, was never asked, and no live group is on screen to wait in.
    await waitFor(() => expect(cardsOf("acme/tool-")).toHaveLength(0));
    expect(mockSearchSkillsSh).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "skills.sh 官方搜索" }),
    ).not.toBeInTheDocument();
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

  it("keeps the question to this list, and forgets it when it is gone", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    const { unmount } = renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");
    // The field settles the word before the list is asked about it (see
    // `SearchInput`), so the question lands a beat after the last keystroke —
    // and lands whole, rather than once per character.
    await waitFor(() => expect(getListView().views.store.query).toBe("gadget"));

    // The question is this list's own state, and it outlives the page: a reader
    // who comes back to the store finds the question they left standing.
    unmount();
    renderExplorePage();
    expect(await screen.findByLabelText("搜索 Skill")).toHaveValue("gadget");
  });
});
