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
import {
  DEFAULT_REPO_CARD_LIMIT,
  setRepoCardLimit,
} from "../../lib/repo-card-preview";
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
  // The app's own router, hash and all: the header reads the current list off
  // the path, and the links it wraps carry the hash prefix the app renders.
  window.location.hash = "#/explore";
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {/* The real app mounts pages inside the shell: the header above them, with
            the two controls both lists share in it. The page's own first row — its
            domain chips — is its own and renders with it. */}
        <HashRouter>
          <AppHeader />
          <ExplorePage />
        </HashRouter>
      </I18nProvider>
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

/** The repository cards mounted under a scope, by the `data-repo` each Card
 *  carries — the stable fact every card has, expandable or not. */
const repoCards = (scope: ParentNode = document.body) =>
  scope.querySelectorAll('[data-slot="card"][data-repo]');

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
  // The preview cap is the reader's own setting; a test that changes it puts
  // it back, so no other test inherits the change (act() because the reset
  // notifies live readers — see the settings-popover suite's note).
  act(() => setRepoCardLimit(DEFAULT_REPO_CARD_LIMIT));
  mockFetchSkillDetail.mockImplementation(
    async (_repo: string, id: string) => ({
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
  it("keeps the domain chips in the content, not in the header", async () => {
    bootRegistry(4);
    renderExplorePage();

    const chip = await screen.findByRole("button", { name: /全部/ });
    // They narrow the list they sit on, so they open the list's own content
    // rather than sharing the shell's row with the controls both lists use.
    expect(document.querySelector("header")?.contains(chip)).toBe(false);
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

  it("caps a repository's rows at the default preview and reveals the rest in place", async () => {
    const user = userEvent.setup();
    // One repository with eight skills: five on the card (the default preview),
    // three behind it.
    harness.init();
    harness.pushAll(makeSkills(8, 0));
    harness.complete();
    renderExplorePage();

    // The cap is what keeps one big repository from pushing every other card
    // off the screen; the bar carries the repository's *total*, so a capped list
    // reads as "these of them" — and the rest is one press away in place.
    expect(await screen.findByText("skill-4")).toBeInTheDocument();
    expect(screen.queryByText("skill-5")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情/ }),
    ).toHaveLength(5);
    await user.click(
      screen.getByRole("button", {
        name: `展开 ${BATCH_REPO} 的全部 8 个 skill`,
      }),
    );
    expect(
      screen.getAllByRole("button", { name: /^查看 skill-\d+ 详情/ }),
    ).toHaveLength(8);
  });

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
    await user.click(await screen.findByRole("button", { name: /开发编程/ }));
    await waitFor(() =>
      expect(screen.queryByText("lint")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("redis")).toBeInTheDocument();

    // ...then search: the query re-answers across the whole registry, so the
    // filtered-out domain's skill comes back.
    await user.type(await searchField(), "lint");
    expect(
      await screen.findByRole("button", { name: "查看 lint 详情" }),
    ).toBeInTheDocument();
  });

  it("scopes the browse list to one domain when its chip is pressed", async () => {
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

    // The list opens on 全部: one card per repository, and a chip for every
    // domain that holds one — plus 未分类 for the repository nothing classified,
    // which is a different claim from the dataset's own 其他 and so takes a chip
    // of its own.
    const cards = () => repoCards(container);
    await screen.findByText("redis");
    expect(cards()).toHaveLength(3);
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
      "3",
    );
    expect(
      screen.getByRole("button", { name: /开发编程/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /测试与质量/ }),
    ).toBeInTheDocument();
    const unclassified = screen.getByRole("button", { name: /^未分类/ });
    expect(
      unclassified.querySelector("svg.lucide-circle-help"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^其他/ })).toBeNull();

    // Pressing a domain scopes the list to its repositories alone.
    await user.click(screen.getByRole("button", { name: /开发编程/ }));
    await waitFor(() =>
      expect(screen.queryByText("lint")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("redis")).toBeInTheDocument();
    expect(screen.queryByText("orphan")).not.toBeInTheDocument();
    expect(cards()).toHaveLength(1);

    // The unclassified chip scopes to the repository no classification covers.
    await user.click(screen.getByRole("button", { name: /^未分类/ }));
    await waitFor(() =>
      expect(screen.queryByText("redis")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("orphan")).toBeInTheDocument();
    expect(cards()).toHaveLength(1);

    // 全部 clears the scope again.
    await user.click(screen.getByRole("button", { name: /^全部/ }));
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

    // An answer and a blank, told apart in the chip bar: the mixed shapes for
    // 其他, the help icon for 未分类, each counting its own.
    const other = await screen.findByRole("button", { name: /^其他/ });
    const unclassified = screen.getByRole("button", { name: /^未分类/ });
    expect(other.querySelector("svg.lucide-shapes")).toBeInTheDocument();
    expect(
      unclassified.querySelector("svg.lucide-circle-help"),
    ).toBeInTheDocument();
    expect(other).toHaveTextContent("1");
    expect(unclassified).toHaveTextContent("1");

    // The repository unit's card rows mark them the same way …
    const strayCardRow = screen.getByRole("button", {
      name: "查看 stray 详情",
    });
    expect(strayCardRow.querySelector("svg.lucide-shapes")).toBeInTheDocument();
    const orphanCardRow = screen.getByRole("button", {
      name: "查看 orphan 详情",
    });
    expect(
      orphanCardRow.querySelector("svg.lucide-circle-help"),
    ).toBeInTheDocument();

    // … and so do the skill unit's rows, which share the resolver.
    await user.click(screen.getByRole("button", { name: "按技能" }));
    const strayRow = await screen.findByRole("button", {
      name: "查看 stray 详情",
    });
    expect(strayRow.querySelector("svg.lucide-shapes")).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "查看 orphan 详情" })
        .querySelector("svg.lucide-circle-help"),
    ).toBeInTheDocument();
  });

  it("keeps a domain chip's label collapsed until the chip is chosen", async () => {
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
    ]);
    harness.complete();
    renderExplorePage();

    // The label is in the DOM (so the chip is named) but clipped to nothing at
    // rest — only the glyph shows.
    const chip = await screen.findByRole("button", { name: /开发编程/ });
    expect(chip.querySelector("span.grid")).toHaveClass("grid-cols-[0fr]");
    expect(chip.querySelector("span.grid")).not.toHaveClass("grid-cols-[1fr]");

    // Choosing the chip unfolds its label for good, so the scope always reads.
    await user.click(chip);
    const revealed = screen.getByRole("button", { name: /开发编程/ });
    expect(revealed.querySelector("span.grid")).toHaveClass("grid-cols-[1fr]");
  });

  it("lists skills by install count and leaves a short run whole", async () => {
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
    await user.click(screen.getByRole("button", { name: "按技能" }));

    // ...and the skill unit with one row per skill, most installed first. o/one's
    // three skills are a run, but below the fold threshold it is listed whole —
    // every row stands on its own, and no fold row appears.
    await waitFor(() => expect(cardOrder()).toEqual(["r1", "r2", "r3", "z1"]));
    expect(repoCards(container).length).toBe(0);
    expect(
      screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
    ).toBeNull();
    // Each row keeps only its source's owner face — the repo path itself is gone.
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(4);
  });

  it("folds a run of four or more and unfolds it on a press", async () => {
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

    await user.click(screen.getByRole("button", { name: "按技能" }));
    await waitFor(() => expect(cardOrder()).toEqual(["r1", "z1"]));

    // o/one's four-skill run folds its three hidden rows into one line whose
    // figure is the run's own combined installs (50 + 40 + 30 + 20), not the
    // whole registry's and not a figure carried over from another run.
    const fold = screen.getByRole("button", { name: /还有 3 个来自 o\/one/ });
    expect(fold).toHaveTextContent("共 140");
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "查看 r2 详情" })).toBeNull();

    // A press unfolds them in place, in rank order, and marks the row open.
    await user.click(fold);
    await waitFor(() =>
      expect(cardOrder()).toEqual(["r1", "r2", "r3", "r4", "z1"]),
    );
    expect(screen.getByRole("button", { name: /收起/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
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

    await user.click(screen.getByRole("button", { name: "按技能" }));
    await waitFor(() =>
      expect(cardOrder()).toEqual(["alpha", "beta", "gamma", "delta"]),
    );

    // The chip counts skills, not repositories: `beta` answers both domains, so
    // testing holds two while no repository leads with it.
    const testing = screen.getByRole("button", { name: /测试与质量/ });
    expect(testing).toHaveTextContent("2");

    // Scoping to testing keeps every skill that belongs to it — including the
    // one whose repository leads elsewhere.
    await user.click(testing);
    await waitFor(() => expect(cardOrder()).toEqual(["beta", "gamma"]));
  });

  it("answers a search with skill rows in the skill unit", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    renderExplorePage();

    await user.click(await screen.findByRole("button", { name: "按技能" }));
    await user.type(await searchField(), "gadget");

    // The match comes back as a skill row rather than a repository card.
    expect(
      await screen.findByRole("button", { name: "查看 gadget-master 详情" }),
    ).toBeInTheDocument();
    expect(repoCards().length).toBe(0);
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

  it("renders a search's whole answer at once, leaving the reveal to the browse list", async () => {
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

    // The count reads the cards' own `data-repo` — one per rendered card.
    const renderedGadgetCards = () =>
      Array.from(repoCards()).filter((card) =>
        card.getAttribute("data-repo")?.startsWith("acme/gadget-"),
      );

    // The reader has scrolled: the browsed list is fully mounted (the reveal
    // paces the browse answer).
    const lastObserver = () =>
      (
        globalThis.IntersectionObserver as unknown as {
          instances: Array<{ trigger(intersecting?: boolean): void }>;
        }
      ).instances.at(-1)!;
    lastObserver().trigger(true);
    await waitFor(() => expect(renderedGadgetCards()).toHaveLength(12));

    // A search answers whole: the unified search view mounts its sections
    // entire, no reveal to pace it and no observer to wait for.
    await user.type(await searchField(), "gadget");
    await waitFor(() => {
      expect(renderedGadgetCards()).toHaveLength(12);
      expect(document.querySelector("mark")).toBeInTheDocument();
    });
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

    // The live section closes the list in the unit it is read in: repository
    // cards here, one per live repository (the covered hit's repository is
    // gone with it, so one remains). The count is the live section's own —
    // the store section above it counts its own single repository too.
    const live = await screen.findByRole("region", {
      name: "skills.sh 官方搜索",
    });
    expect(within(live).getByText("1 个仓库")).toBeInTheDocument();
    // The live-only skill is on the page, in its repository's card…
    expect(screen.getByText("sprocket")).toBeInTheDocument();
    expect(screen.getByText("acme/fresh")).toBeInTheDocument();
    // …and the indexed copy is still the only gadget-master: a live hit the
    // local answer already covers is not a second row.
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

    // The section header counts repositories, not skills.
    expect(await screen.findByText("3 个仓库")).toBeInTheDocument();
    const fresh = document.querySelector('[data-repo="acme/fresh"]')!;
    expect(
      within(fresh as HTMLElement)
        .getAllByRole("button", {
          name: /查看 .+ 详情/,
        })
        .map((el) => el.getAttribute("aria-label")),
    ).toEqual(["查看 cog 详情", "查看 sprocket 详情"]);
    // A live row claims nothing its source does not carry: no 暂无描述
    // placeholder standing in for a description nobody published, and no
    // help mark — nothing ever classified it, but nothing looked either.
    expect(within(fresh as HTMLElement).queryByText("暂无描述")).toBeNull();
    expect(fresh.querySelector("svg.lucide-circle-help")).toBeNull();
    // The bar still knows its owner: the face rides the label, resolving
    // through the mirror and then GitHub's own endpoint.
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
    // Uncapped is not narrow: seven rows outrun the preview cap, so the card
    // takes the open card's own footprint on its own — full grid row, body in
    // two balanced columns — exactly the layout the store's expansion gives.
    const item = (fresh as HTMLElement).closest("li")!;
    expect(item).toHaveClass("col-span-full");
    const body = (fresh as HTMLElement).querySelector(
      '[data-slot="card-content"] ul',
    )!;
    expect(body).toHaveClass("grid-flow-col");
    expect(body).toHaveStyle({ gridTemplateRows: "repeat(4, auto)" });
  });

  it("measures a search card's width by the reader's own preview cap", async () => {
    const user = userEvent.setup();
    // Four skills in one repository: within the default cap of five, over the
    // reader's own choice of three — the setting, not a fixed figure, is the
    // threshold the wide footprint reads.
    setRepoCardLimit(3);
    harness.init();
    harness.pushAll(makeSkills(4, 0));
    harness.complete();
    renderExplorePage();
    await screen.findByText("skill-0");

    await user.type(await searchField(), "skill-");

    const card = await waitFor(() => {
      const el = document.querySelector(
        '[data-repo="acme/batch"]',
      ) as HTMLElement | null;
      expect(el).not.toBeNull();
      // The browse card under this cap holds three rows; only the search
      // answer lists the repository whole, so four rows mean the swap landed.
      expect(el!.querySelectorAll('button[aria-label^="查看"]')).toHaveLength(
        4,
      );
      return el!;
    });
    // Past the cap, the search card takes the open card's own footprint —
    // full grid row, body in two balanced columns over ceil(4/2) rows.
    expect(card.closest("li")).toHaveClass("col-span-full");
    const body = card.querySelector('[data-slot="card-content"] ul')!;
    expect(body).toHaveClass("grid-flow-col");
    expect(body).toHaveStyle({ gridTemplateRows: "repeat(2, auto)" });
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
    await user.click(screen.getByRole("button", { name: "按技能" }));
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
    expect(live.querySelector("svg.lucide-circle-help")).toBeNull();
    // The indexed skill is on the page beside it, as a repository card's row:
    // that surface prints no per-skill figure either (the figure belongs to
    // the standalone skill card — see skill-card.test.tsx), so what this test
    // pins is that the live row asks for nothing it cannot have.
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

    await user.click(screen.getByRole("button", { name: "按技能" }));
    await user.type(await searchField(), "gadget");

    const section = await screen.findByRole("region", {
      name: "skills.sh 官方搜索",
    });
    // The section's rows are the list's own full-width rows, not the card
    // grid a live section used to hold — one shape per unit, whichever
    // answer the rows belong to.
    const list = section.querySelector("ul")!;
    expect(list).toHaveClass(SKILL_ROW_LIST_CLASS);
    // Enumerated, not ranked: the endpoint's relevance is no contest to
    // medal, so no live ordinal wears the podium ink the indexed rows above
    // carry.
    expect(section.querySelector("span")!.className).not.toContain("amber");
    // The query's own terms highlight the live names, as they do the indexed
    // ones.
    expect(section.querySelector("mark")).not.toBeNull();
    // The header counts skills, not repositories.
    expect(within(section).getByText("2 个 skill")).toBeInTheDocument();
  });

  it("shows the live answer when the local index has no match", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "sprocket");

    expect(
      await screen.findByRole("region", { name: "skills.sh 官方搜索" }),
    ).toBeInTheDocument();
    // The live answer replaces the empty state rather than sitting behind it.
    expect(screen.queryByText(/未找到匹配/)).not.toBeInTheDocument();
  });

  it("holds a searching state while the whole answer is still in flight", async () => {
    const user = userEvent.setup();
    bootGadgetRegistry();
    // The live request holds its answer until the test lets go of it: the
    // window between "the store answer landed empty" and "the live rows
    // arrive" is exactly where the not-found flash used to live.
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

    // Every section came back empty — the store's, the installed one's — and
    // the live one is still in flight: a searching line holds the space
    // instead of a "not found" that only describes half the answer.
    expect(
      await screen.findByText("正在搜索应用商店与 skills.sh 的实时结果…"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/未找到匹配/)).not.toBeInTheDocument();

    // The answer lands and replaces the searching line in place.
    resolveLive([liveSkill("sprocket", "acme/fresh", 7)]);
    expect(await screen.findByText("sprocket")).toBeInTheDocument();
    expect(
      screen.queryByText("正在搜索应用商店与 skills.sh 的实时结果…"),
    ).not.toBeInTheDocument();
  });

  it("answers a search in three ordered sections", async () => {
    const user = userEvent.setup();
    // An install that matches, a store entry that matches, and a live hit the
    // index does not carry: the answer spans all three sections.
    installMockSkill("gadget-master");
    bootGadgetRegistry();
    mockSearchSkillsSh.mockResolvedValue([
      liveSkill("sprocket", "acme/fresh", 7),
    ]);
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    const installed = await screen.findByRole("region", { name: "本地已安装" });
    const store = await screen.findByRole("region", { name: "应用商店" });
    const live = await screen.findByRole("region", {
      name: "skills.sh 官方搜索",
    });
    // In the order the reader reaches for them: what this machine has, what
    // the store carries, what skills.sh answers live.
    expect(
      installed.compareDocumentPosition(store) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      store.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Each section counts its own answer in its header — one repository
    // apiece — while the card bars stay clean: a one-skill card has nothing
    // to offer, so no figure rides it.
    expect(within(installed).getByText("1 个仓库")).toBeInTheDocument();
    expect(within(store).getByText("1 个仓库")).toBeInTheDocument();
    expect(within(live).getByText("1 个仓库")).toBeInTheDocument();
    expect(within(installed).queryByText(/个 skill/)).toBeNull();
  });

  it("walks the drawer inside the section the skill was opened from", async () => {
    const user = userEvent.setup();
    // The same skill legitimately sits in two sections — the install, and the
    // store entry behind it are two facts — and the drawer wears the surface
    // of the one that was opened.
    installMockSkill("gadget-master");
    bootGadgetRegistry();
    renderExplorePage();
    await screen.findByText("gadget-master");

    await user.type(await searchField(), "gadget");

    // The installed section's row opens the installed surface: no store
    // install CTA — the skill is already home, and the drawer says so with
    // the switch, not with a button.
    const installed = await screen.findByRole("region", { name: "本地已安装" });
    await user.click(
      within(installed).getByRole("button", {
        name: "查看 gadget-master 详情",
      }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: /安装/,
      }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // The store section's row opens the store surface — and its install CTA
    // reads the persisted state: the skill is on disk, so the store's own
    // button is the installed badge.
    const store = await screen.findByRole("region", { name: "应用商店" });
    await user.click(
      within(store).getByRole("button", { name: "查看 gadget-master 详情" }),
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
    // One repository card in the list, five rows in the card: the list run is
    // the cap, not the full 50-skill repository.
    expect(list.children).toHaveLength(1);
    expect(list.querySelectorAll("li li")).toHaveLength(5);

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
    expect(list.querySelectorAll("li li")).toHaveLength(5);
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
    // the reader already has open.
    expect(await screen.findByText("skill-0")).toBeInTheDocument();
    expect(screen.getByText("skill-3")).toBeInTheDocument();
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
