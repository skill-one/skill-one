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
import { setUnit } from "../../lib/list-view";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { formatCount } from "../../lib/utils";
import { I18nProvider } from "../../i18n/language-provider";
import type { Skill } from "../../types/skill";
import type { RegistryHarness } from "../../test/registry-harness";
import { resetMockInstalledSkills } from "../../lib/mock-local";
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

let queryClient: QueryClient;

function renderExplorePage() {
  // The app's own router, hash and all: the header reads the current list off
  // the path, and the links it wraps carry the hash prefix the app renders.
  window.location.hash = "#/explore";
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {/* The real app mounts pages inside the shell, the header above them.
            The list's own controls — the search field, the domain picker, the
            sort switch — stand on the page's first row and render with it. */}
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

/** The repository cards mounted under a scope, by the `data-repo` each Card
 *  carries — the stable fact every card has, expandable or not. */
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
vi.setConfig({ testTimeout: 15_000 });

describe("ExplorePage", () => {
  it("keeps the domain picker in the content, not in the header", async () => {
    bootRegistry(4);
    renderExplorePage();

    const picker = await screen.findByRole("button", { name: "分类" });
    // It narrows the list it sits on, so it opens the list's own content
    // rather than sharing the shell's row with the controls both lists use.
    expect(document.querySelector("header")?.contains(picker)).toBe(false);
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

  it("answers the shape switch with the two arrangements, and orders only by popularity", async () => {
    const user = userEvent.setup();
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
    const { unmount } = renderExplorePage();
    // The store's only order is the figure its own rows display, so it has no
    // order control to press — what it has instead is the shape, and both of its
    // arrangements stand on the row.
    expect(
      screen.queryByRole("button", { name: "排序方式" }),
    ).not.toBeInTheDocument();

    await pickUnit(user, "列表");
    await screen.findByText("few");
    // 列表 is one row per skill, most installed first — the figure each row
    // shows, so the order and the numbers beside it cannot disagree.
    await waitFor(() => expect(cardOrder()).toEqual(["few", "star"]));
    // The choice lives in the shared view, so it survives the page going away.
    unmount();
    renderExplorePage();
    expect(screen.getByRole("button", { name: "列表" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await pickUnit(user, "卡片");
    // 卡片 is one card per repository, led by the most-starred one — however
    // few installs its skills claim.
    await waitFor(() => expect(cardOrder()).toEqual(["star", "few"]));
    expect(repoCards()).toHaveLength(2);
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
    renderExplorePage();

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
    expect(document.querySelector("ul.grid")).toBeInTheDocument();
    // No group sections anywhere: the ranking is the only order.
    expect(document.querySelector("section[aria-label]")).toBeNull();

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
