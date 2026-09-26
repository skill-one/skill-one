import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParseKeys } from "i18next";
import {
  screen,
  fireEvent,
  waitFor,
  within,
  configure,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MySkillsPage } from "./my-skills-page";
import { AppHeader } from "../../components/app-header";
import { renderWithRouter } from "../../test/test-utils";
import {
  addMockLocalSkill,
  installMockSkill,
  resetMockAgentStatus,
  resetMockInstalledSkills,
  setMockSkillEnabled,
} from "../../lib/mock-local";
import { resetMockProvenance, seedMockProvenance } from "../../lib/provenance";
import { resetLinkSuggestions } from "../../lib/link-suggestions";
import { dayFilingOf } from "../../lib/time-groups";
import { formatDayHeading } from "../../lib/utils";
import i18n from "../../i18n";

/**
 * The group header the installed list renders for an install `daysAgo` days
 * old. The page files by calendar day, so the expectation follows the stamp —
 * the same clock arithmetic the mock seeds with (`mockInstalledAt`) — rather
 * than a hardcoded date. The mirror walks the same two branches the page's
 * `groupHeading` does: a named day through i18n, a dated day through the
 * locale's own date format; the filing and the format each have their own
 * frozen-clock tests in `lib/time-groups` / `lib/utils`.
 */
function dayTitle(daysAgo: number): string {
  const stamp = Math.floor(Date.now() / 1000) - daysAgo * 24 * 60 * 60;
  const filing = dayFilingOf(stamp);
  if (!filing) return i18n.t("time.unknown");
  return filing.titleKey
    ? i18n.t(filing.titleKey as ParseKeys)
    : formatDayHeading(filing.start ?? 0);
}

/** The page's search box debounces for real; 1 s is a contention flake. */
configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates and the
// page looks up the store entries behind recorded sources; both mocks answer
// "nothing found" by default so the worker-less test env stays silent, and the
// link-suggestion / store-stats tests below override them. The unified search
// view also asks the registry's grouped search for its store section; the mock
// answers empty by default, so that section hides.
const { searchSkills, lookupSkills, getGroups, registrySnapshot } = vi.hoisted(
  () => ({
    searchSkills: vi.fn(),
    lookupSkills: vi.fn(),
    getGroups: vi.fn(),
    // One stable object: the page reads it through useSyncExternalStore, which
    // treats a fresh snapshot on every call as an infinite render loop.
    registrySnapshot: { ready: true, epoch: 1 },
  }),
);
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills,
  getGroups,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  getGroups.mockResolvedValue({ groups: [], total: 0 });
  resetLinkSuggestions();
});

// The page reads installed skills through local-skills, which falls back to
// the mutable mock store in the browser (this test env), so mutations below
// actually change the data the page re-fetches after invalidate.

/**
 * The page as the app mounts it: inside the shell, under the route the deep link
 * arrives on. The header carries the two controls both lists share, so a page
 * mounted alone could be typed into but not searched.
 */
function renderPage(route = "/my-skills") {
  return renderWithRouter(
    <>
      <AppHeader />
      <MySkillsPage />
    </>,
    { route },
  );
}

describe("MySkillsPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
    resetMockProvenance();
    // Agent link exclusions live in localStorage; one test's opt-out must
    // not leak into the next.
    window.localStorage.clear();
  });

  it("gives every source-less install a home in one repository-style card", async () => {
    renderPage();

    // The browse bar leads with 全部 and the 未分类 chip: an install no store
    // entry covers has no classification either, and that is not the dataset's
    // 其他 — nobody has looked at it at all.
    expect(
      await screen.findByRole("button", { name: /^全部/ }),
    ).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^未分类/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^其他/ })).toBeNull();
    // No install has a recorded source, so every skill lives in one pool card:
    // it lists the preview size, and its bar states the total.
    expect(await screen.findByText("本地安装")).toBeInTheDocument();
    expect(screen.getByText("6 个 skill")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(5);
    // The pool is not a repository, so its bar opens the page that lists it
    // whole rather than a repository's page.
    expect(
      screen.getByRole("link", { name: "查看本地安装，6 个 skill" }),
    ).toHaveAttribute("href", "/my-skills/local");
  });

  it("renders each installed skill", async () => {
    renderPage();

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("pptx")).toBeInTheDocument();
    expect(screen.getByText("mcp-builder")).toBeInTheDocument();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    // The sixth is past the pool card's preview: the bar's own total accounts
    // for it, and the bar's door is where it is listed whole.
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
    expect(screen.getByText("6 个 skill")).toBeInTheDocument();
  });

  it("caps a repository's card at the preview size and states its total", async () => {
    // All six installs share one repository: the card lists the first five and
    // its bar states the repository's own total, which is what lets a capped
    // list read as "these of them" beside the door to the rest.
    seedMockProvenance(
      Object.fromEntries(
        [
          "pdf",
          "docx",
          "pptx",
          "mcp-builder",
          "code-review",
          "frontend-design",
        ].map((name) => [name, { repo: "acme/tools", slug: name }]),
      ),
    );
    renderPage();

    const bar = await screen.findByRole("link", {
      name: "查看仓库 acme/tools，6 个 skill",
    });
    expect(bar).toHaveTextContent("6 个 skill");
    // The door leads to the repository as *this* list reads it — the installs
    // on disk — and not to the store's page for the same repository, which is
    // one deliberate step further in (see `RepoPage`).
    expect(bar).toHaveAttribute("href", "/my-skills/repo/acme/tools");
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(5);
    expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
  });

  it("removes a skill from its detail panel and updates the stats", async () => {
    const user = userEvent.setup();
    renderPage();

    // No card carries an uninstall control: the whole card body is a click
    // target and removal is irreversible, so the action lives one step away.
    await screen.findByText("pdf");
    expect(screen.queryByTitle("移除")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看 pdf 详情" }));
    await user.click(await screen.findByRole("button", { name: "移除" }));

    // The press opens the ask, not the act: the dialog names the skill, and
    // only its destructive confirm removes.
    const ask = await screen.findByRole("dialog", { name: "移除 pdf？" });
    await user.click(within(ask).getByRole("button", { name: "移除" }));

    // The panel closes with the skill: this list shrinks, so the index it was
    // open at would otherwise land on a different skill.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "移除 pdf？" })).not.toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "查看 pdf 详情" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the empty state after removing every skill", async () => {
    const user = userEvent.setup();
    renderPage();

    for (let remaining = 6; remaining > 0; remaining--) {
      // The cards only answer to a role query once the panel has closed, so
      // each turn of the loop also proves the previous uninstall dismissed it.
      const [first] = await screen.findAllByRole("button", {
        name: /查看 .+ 详情/,
      });
      await user.click(first);
      await user.click(await screen.findByRole("button", { name: "移除" }));
      const ask = await screen.findByRole("dialog", {
        name: /移除 .+？/,
      });
      await user.click(within(ask).getByRole("button", { name: "移除" }));
      await waitFor(() =>
        expect(
          screen.queryAllByRole("button", { name: /查看 .+ 详情/ }),
        ).toHaveLength(remaining - 1),
      );
    }

    expect(await screen.findByText("还没有安装任何技能")).toBeInTheDocument();
  });

  it("offers one group switch per card, on when every skill is enabled", async () => {
    renderPage();

    // All six installs pool into one card: its bar carries the one switch that
    // governs them all, checked because the pool is fully enabled.
    const groupSwitch = await screen.findByRole("switch", {
      name: "全部关闭（本地安装）",
    });
    expect(groupSwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("disables every skill of a card with one press, and re-enables them", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    );

    // The whole pool is now off: the visible rows dim together and the bar's
    // own switch flips, including for the two skills past the preview cap that
    // the backend write still covers (the card re-reads the same records).
    const off = await screen.findByRole("switch", {
      name: "全部开启（本地安装）",
    });
    expect(off).toHaveAttribute("aria-checked", "false");
    const rows = container.querySelectorAll("[data-skill]");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(row).toHaveClass("opacity-60"));

    await user.click(off);
    expect(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    ).toHaveAttribute("aria-checked", "true");
    rows.forEach((row) => expect(row).not.toHaveClass("opacity-60"));
  });

  it("shows a card with one disabled skill as a half-on switch", async () => {
    // One skill parked in the backend's disabled dir: the card is neither all
    // on nor all off, so its switch reads as the half state rather than
    // pretending the group is simply off.
    setMockSkillEnabled("pdf", false);
    renderPage();

    const groupSwitch = await screen.findByRole("switch", {
      name: "全部开启（本地安装）",
    });
    expect(groupSwitch).toHaveAttribute("aria-checked", "false");
    expect(groupSwitch).toHaveClass("data-unchecked:bg-primary/40!");
  });

  it("enables every skill of a half-on card with one press", async () => {
    const user = userEvent.setup();
    setMockSkillEnabled("pdf", false);
    const { container } = renderPage();

    await user.click(
      await screen.findByRole("switch", { name: "全部开启（本地安装）" }),
    );

    // Enable-all-first: the previously disabled skill joins the rest, its row
    // un-dims, and the group reaches the fully-on state in one press.
    expect(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    ).toHaveAttribute("aria-checked", "true");
    const row = container.querySelector('[data-skill="pdf"]');
    expect(row).not.toHaveClass("opacity-60");
  });

  it("keeps enablement on the bar rather than on each row", async () => {
    const { container } = renderPage();

    await screen.findByRole("switch", { name: "全部关闭（本地安装）" });

    // No row carries a switch: per-skill switching waits for the repository's
    // own page, so a card reads as a list rather than as a row of controls.
    const row = container.querySelector('[data-skill="pdf"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector('[role="switch"]')).toBeNull();
  });

  it("dims a disabled row behind the bar's group switch", async () => {
    // The dimmed row is the evidence the group switch's half state explains.
    setMockSkillEnabled("pdf", false);
    const { container } = renderPage();

    await screen.findByRole("switch", { name: "全部开启（本地安装）" });
    const row = container.querySelector('[data-skill="pdf"]');
    expect(row).toHaveClass("opacity-60");
  });

  it("scopes each card's switch to that card's own skills", async () => {
    const user = userEvent.setup();
    // pdf carries a recorded source and moves into its own repository card;
    // the other five stay pooled under 本地安装.
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    const { container } = renderPage();

    const repoSwitch = await screen.findByRole("switch", {
      name: "全部关闭（anthropics/skills）",
    });
    const poolSwitch = screen.getByRole("switch", {
      name: "全部关闭（本地安装）",
    });
    expect(screen.getAllByRole("switch")).toHaveLength(2);

    await user.click(repoSwitch);

    // Only the repository's one skill goes off: its row dims and only its bar
    // switch flips, while the pool's five stay enabled behind a checked switch.
    expect(
      await screen.findByRole("switch", {
        name: "全部开启（anthropics/skills）",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(poolSwitch).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector('[data-skill="pdf"]')).toHaveClass(
      "opacity-60",
    );
    expect(container.querySelector('[data-skill="docx"]')).not.toHaveClass(
      "opacity-60",
    );
  });

  it("shows each skill's description", async () => {
    renderPage();

    expect(
      await screen.findByText("PDF 文档读取、生成、合并、拆分与标注。"),
    ).toBeInTheDocument();
  });

  it("opens the shared detail drawer when a row is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    // The installed record carries no repo (agents-skills 0.13 records no
    // install source): the panel reads the SKILL.md from the (mock) skills
    // directory and labels the skill 本地安装.
    expect(within(dialog).getByText("pdf")).toBeInTheDocument();
    expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
    expect(
      within(dialog).getByText("PDF 文档读取、生成、合并、拆分与标注。"),
    ).toBeInTheDocument();
    // The markdown body is code-split (see skill-detail-panel): it resolves
    // async on first open, so wait for the rendered instructions.
    expect(
      await within(dialog).findByText(
        "（浏览器演示数据：模拟的本地 SKILL.md）",
      ),
    ).toBeInTheDocument();
  });

  it("walks the installed list with the arrow keys inside the drawer", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );
    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    // The drawer now shows the next installed skill (mock order: pdf → docx).
    expect(
      await within(dialog).findByText("以编程方式创建和编辑 Word 文档。"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("docx")).toBeInTheDocument();
  });

  it("labels a no-source skill's drawer as 本地安装 without repo links", async () => {
    const user = userEvent.setup();
    addMockLocalSkill("my-local");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "查看 my-local 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
    expect(
      within(dialog).queryByText("anthropics/skills"),
    ).not.toBeInTheDocument();
  });

  it("does not open the drawer or the door from the bar's switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.click(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    );
    // The switch is a sibling of the bar's door, not a child: the press toggles
    // the group without opening the drawer or walking through the door.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "查看本地安装，6 个 skill" }),
    ).toBeInTheDocument();
  });

  it("uses '暂无描述' as a placeholder when a skill has no description", async () => {
    installMockSkill("no-desc-skill");
    renderPage();

    expect(await screen.findByText("no-desc-skill")).toBeInTheDocument();
    expect(screen.getByText("暂无描述")).toBeInTheDocument();
  });

  it("names a source-less install as 本地安装 and draws no owner face", async () => {
    const { container } = renderPage();

    await screen.findByText("pdf");
    // Every install here is tool-installed (no ledger entry), so the one card's
    // bar states that in place of a repository, and no owner face joins it.
    const bars = container.querySelectorAll('[data-slot="card-footer"]');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveTextContent("本地安装");
    expect(
      container.querySelectorAll(
        '[data-slot="card-footer"] [data-slot="avatar"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-slot="skill-cover"]'),
    ).toHaveLength(0);
  });

  it("names a recorded source in the card's bar, with the owner's face", async () => {
    const { container } = renderPage();
    // The ledger has a source for pdf (installed through this app); the other
    // five are tool installs with no entry.
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });

    // The sourced skill gets a card of its own, and its bar is the door to the
    // repository: the owner's face, the repo path, and the count.
    const bar = await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });
    expect(bar).toHaveTextContent("anthropics/skills");
    expect(bar).toHaveTextContent("1 个 skill");
    // The other five keep the pool card, whose bar names no repository.
    expect(screen.getAllByText("本地安装")).toHaveLength(1);
    // Only the sourced card can name an owner, so it carries the only face.
    expect(container.querySelectorAll('ul [data-slot="avatar"]')).toHaveLength(
      1,
    );
  });

  it("links a sourced skill's detail drawer to its repo instead of 本地安装", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderPage();
    await screen.findByText("pdf");
    // The provenance query lands asynchronously and moves pdf into its own
    // repository card; wait for that reshuffle to settle before clicking, so
    // the row is not detached mid-press.
    await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    // The panel now knows the repo: the description is the source link, not
    // the bare 本地安装 label.
    expect(within(dialog).getByText("anthropics/skills")).toBeInTheDocument();
    expect(within(dialog).queryByText("本地安装")).not.toBeInTheDocument();
  });

  it("carries the enable switch, and no registry figures, into the drawer", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderPage();
    // Same wait: the provenance-driven regroup settles before the click.
    await screen.findByText("pdf");
    await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    // The per-skill switch takes the slot the store's drawer puts its install
    // CTA in — this list installs nothing, its skills are already on disk.
    expect(
      within(dialog).getByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "安装" }),
    ).not.toBeInTheDocument();
    // A recorded repo does not turn the drawer into the store's: there are no
    // registry figures to show, and an install figure rendering as a 0 here
    // would contradict the card, which shows none.
    expect(within(dialog).queryByText("安装量")).not.toBeInTheDocument();

    // The drawer's switch writes the same backend state the bar's does.
    await user.click(within(dialog).getByRole("switch", { name: "关闭 pdf" }));
    expect(
      await within(dialog).findByRole("switch", { name: "开启 pdf" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("shows the store's classification and install count for a resolved source", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    // The registry still lists the source the ledger recorded, so the installed
    // list has the store facts an on-disk record never carries.
    lookupSkills.mockResolvedValue({
      entries: [
        {
          name: "pdf",
          repo: "anthropics/skills",
          description: "PDF 文档读取、生成、合并、拆分与标注。",
          stars: 169600,
          downloads: 2991984,
          path: "skills/anthropics/skills/pdf",
          profile: { domain: ["content-creation"] },
        },
      ],
    });
    renderPage();

    // The resolved entry is what classifies the install, so a chip for its
    // domain joins the filter bar — and the card's bar prints the repository's
    // stars, the same figure the store's own repository cards carry.
    expect(
      await screen.findByRole("button", { name: /^内容创作/ }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("169600 stars")).toBeInTheDocument();

    // The drawer states the classification and the store figure the compact
    // repository row has no room for.
    await user.click(screen.getByRole("button", { name: "查看 pdf 详情" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("3M")).toBeInTheDocument();
    expect(within(dialog).getByText("内容创作")).toBeInTheDocument();
  });

  it("shows no store facts for a source the registry no longer lists", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    // The lookup answers nothing for the ref (a fork the index dropped, say):
    // the card keeps the recorded source — its bar is what names it — and shows
    // no classification and no figure: an absent fact is not a zero one.
    renderPage();

    expect(
      await screen.findByRole("link", {
        name: /^查看仓库 anthropics\/skills/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("内容创作")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/stars/)).toBeNull();
  });

  it("offers a confirmable store link for a tool-installed skill", async () => {
    const user = userEvent.setup();
    // The registry carries a same-slug entry whose description is *different*
    // enough (< 90%) from the installed skill's: because it is below the
    // auto-link threshold, the card offers the association for the user to
    // confirm instead of linking silently.
    searchSkills.mockResolvedValue({
      hits: [
        {
          skill: {
            name: "pdf",
            repo: "anthropics/skills",
            description: "Convert PDF files to images and text.",
            stars: 99,
            downloads: 99,
            path: "skills/anthropics/skills/pdf",
          },
          matched: {},
        },
      ],
      total: 1,
    });
    renderPage();

    const badge = await screen.findByRole("button", {
      name: "关联 pdf 的商店来源",
    });
    await user.click(badge);

    // The popover lists the namesake candidates; clicking one confirms the
    // source link right there — no second dialog.
    const candidate = await screen.findByRole("button", {
      name: /anthropics\/skills/,
    });
    expect(screen.getByText(/\d+%/)).toBeInTheDocument();
    await user.click(candidate);

    // The association becomes indistinguishable from a native install: pdf now
    // lives in its own repository card, whose bar names the source, and the
    // affordance is gone.
    expect(
      await screen.findByRole("link", {
        name: /^查看仓库 anthropics\/skills/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
    ).not.toBeInTheDocument();
    // And the persisted ledger carries the pick.
    expect(
      JSON.parse(localStorage.getItem("skill-one.provenance") ?? "{}").skills
        .pdf?.repo,
    ).toBe("anthropics/skills");
  });

  it("auto-links a tool-installed skill whose description matches a namesake", async () => {
    // Identical wording (≥ 90% similarity) is treated as the same skill and
    // linked automatically — no 关联来源 badge or confirm dialog ever appears.
    searchSkills.mockResolvedValue({
      hits: [
        {
          skill: {
            name: "pdf",
            repo: "anthropics/skills",
            description: "PDF 文档读取、生成、合并、拆分与标注。",
            stars: 99,
            downloads: 99,
            path: "skills/anthropics/skills/pdf",
          },
          matched: {},
        },
      ],
      total: 1,
    });
    renderPage();

    // No link-source affordance — it linked on its own.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
      ).not.toBeInTheDocument(),
    );
    // The persisted ledger already carries the source the auto-link wrote.
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("skill-one.provenance") ?? "{}").skills
          .pdf?.repo,
      ).toBe("anthropics/skills"),
    );
    // And pdf's card now names the source it was linked to on its own.
    await screen.findByRole("link", {
      name: /^查看仓库 anthropics\/skills/,
    });
  });

  it("pre-fills the search box from the ?skill= deep link", async () => {
    // The menu bar popover deep links to /my-skills?skill=<name>; the page
    // must land with that skill pre-filtered and consume the param.
    renderPage("/my-skills?skill=pdf");

    expect(await screen.findByLabelText("搜索 Skill")).toHaveValue("pdf");
    expect(await screen.findByText("pdf")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("docx")).not.toBeInTheDocument(),
    );
  });

  it("filters skills by search text", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The debounce settles before the answer narrows.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(1),
    );
    expect(screen.queryByText("docx")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("搜索 Skill"));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(5),
    );
  });

  it("highlights matched terms on a searched card, like the store's list", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The installed list's index reports matched terms per field exactly as
    // the registry's worker does, so the shared card marks them the same way.
    await waitFor(() =>
      expect(container.querySelector("mark")).toHaveTextContent("pdf"),
    );
  });

  it("renders no marks outside a search", async () => {
    const { container } = renderPage();

    await screen.findByText("pdf");
    expect(container.querySelector("mark")).toBeNull();
  });

  it("searches Chinese text but not a fragment inside a word", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    // The descriptions here are Chinese and carry no word separators; the
    // shared index splits Han text into character bigrams, so a phrase still
    // answers — pdf (「PDF 文档读取…」) and docx (「…Word 文档。」).
    await user.type(screen.getByLabelText("搜索 Skill"), "文档");
    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();

    // "df" sits inside the term "pdf": the substring filter used to answer it,
    // a term index does not.
    await user.clear(screen.getByLabelText("搜索 Skill"));
    await user.type(screen.getByLabelText("搜索 Skill"), "df");
    expect(await screen.findByText(/未找到匹配/)).toBeInTheDocument();
  });

  it("shows a no-match empty state for a search with no results", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "zzz");

    expect(await screen.findByText(/未找到匹配/)).toBeInTheDocument();
  });

  it("answers a search with the store section beside the installs", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The installed answer leads, in the installed index's own relevance
    // order, and only it: docx does not match.
    const installed = await screen.findByRole("region", { name: "本地已安装" });
    expect(within(installed).getByText("pdf")).toBeInTheDocument();
    expect(within(installed).queryByText("docx")).not.toBeInTheDocument();
    // The store's section answers the same question from its own index; the
    // mocked registry carries nothing, so its section stays empty and hidden
    // rather than reading as a zero.
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "应用商店" })).toBeNull(),
    );
  });

  it("scopes the list to a classification from the chip row", async () => {
    const user = userEvent.setup();
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    // The registry still lists the source the ledger recorded, so pdf wears a
    // store classification and a chip for it joins the filter bar.
    lookupSkills.mockResolvedValue({
      entries: [
        {
          name: "pdf",
          repo: "anthropics/skills",
          description: "PDF 文档读取、生成、合并、拆分与标注。",
          stars: 169600,
          downloads: 2991984,
          path: "skills/anthropics/skills/pdf",
          profile: { domain: ["content-creation"] },
        },
      ],
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^内容创作/ }));

    // The scope leaves only the classified skill on screen...
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(1),
    );
    expect(
      screen.getByRole("button", { name: "查看 pdf 详情" }),
    ).toBeInTheDocument();

    // ...and 全部 clears the scope again.
    await user.click(screen.getByRole("button", { name: /^全部/ }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(6),
    );
  });

  // The repository unit (the default): one card per source, each card filed
  // into the day group its newest install belongs to.

  it("files the repository unit's cards by each card's newest install", async () => {
    // Mock install ages: pdf today, docx 3 days, pptx 12, mcp-builder 45,
    // code-review 200, frontend-design 400. The ledgers split them three ways:
    // a one-skill repo fresh today, the pool (docx/pptx, newest 3 days), and a
    // repo whose skills are all old (newest 45 days).
    seedMockProvenance({
      pdf: { repo: "zoo/new", slug: "pdf" },
      "mcp-builder": { repo: "acme/tools", slug: "mcp-builder" },
      "code-review": { repo: "acme/tools", slug: "code-review" },
      "frontend-design": { repo: "acme/tools", slug: "frontend-design" },
    });
    const { container } = renderPage();

    await screen.findByText("zoo/new");
    // The three cards land in three day groups, newest first — the middle name
    // of each group names one repository, never a skill count.
    const sections = [
      ...container.querySelectorAll("section[aria-label]"),
    ] as HTMLElement[];
    expect(sections.map((node) => node.getAttribute("aria-label"))).toEqual([
      "今天",
      dayTitle(3),
      dayTitle(45),
    ]);

    expect(
      within(sections[0]).getByRole("link", {
        name: "查看仓库 zoo/new，1 个 skill",
      }),
    ).toBeInTheDocument();
    expect(
      within(sections[1]).getByRole("link", {
        name: "查看本地安装，2 个 skill",
      }),
    ).toBeInTheDocument();
    expect(
      within(sections[2]).getByRole("link", {
        name: "查看仓库 acme/tools，3 个 skill",
      }),
    ).toBeInTheDocument();
  });

  it("files a card by its newest install and lists that install first", async () => {
    // One repository holds both a fresh install (pdf, today) and an ancient one
    // (frontend-design, 400 days): the card reads 今天, not the day the old
    // install landed — and the fresh install leads the card's preview instead
    // of hiding past the cap.
    seedMockProvenance({
      pdf: { repo: "acme/tools", slug: "pdf" },
      "frontend-design": { repo: "acme/tools", slug: "frontend-design" },
    });
    const { container } = renderPage();

    await screen.findByText("acme/tools");
    const sections = [
      ...container.querySelectorAll("section[aria-label]"),
    ] as HTMLElement[];
    // The pool (newest docx, 3 days) is the other, older day.
    expect(sections.map((node) => node.getAttribute("aria-label"))).toEqual([
      "今天",
      dayTitle(3),
    ]);

    const today = sections[0];
    expect(
      within(today).getByRole("link", {
        name: "查看仓库 acme/tools，2 个 skill",
      }),
    ).toBeInTheDocument();
    // Inside the card, newest first.
    expect(
      within(today)
        .getAllByRole("button", { name: /查看 .+ 详情/ })
        .map((node) => node.getAttribute("aria-label")),
    ).toEqual(["查看 pdf 详情", "查看 frontend-design 详情"]);
  });

  it("walks the drawer across the day groups in newest-first order", async () => {
    const user = userEvent.setup();
    seedMockProvenance({
      pdf: { repo: "zoo/new", slug: "pdf" },
      "mcp-builder": { repo: "acme/tools", slug: "mcp-builder" },
      "code-review": { repo: "acme/tools", slug: "code-review" },
      "frontend-design": { repo: "acme/tools", slug: "frontend-design" },
    });
    renderPage();

    await screen.findByText("zoo/new");
    // pdf is the only row of today's card; the next thing the walk reaches is
    // the pool's own newest row (docx, 3 days back) — the day boundary does not
    // interrupt the walk.
    const pdfButton = await screen.findByRole("button", {
      name: "查看 pdf 详情",
    });
    await user.click(pdfButton);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("pdf")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    // The drawer now shows the pool's own newest install (docx), identified by
    // its description the same way the other drawer test names it.
    expect(
      await within(dialog).findByText("以编程方式创建和编辑 Word 文档。"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("docx")).toBeInTheDocument();
  });

  // The skill unit: the store's second reading of the same installs — one row
  // per skill rather than one card per source, filed newest-first into
  // per-day groups. The page's own mocks serve it.

  /** The four installs the one-source tests gather into one source. */
  const RUN_SOURCE = ["pdf", "docx", "pptx", "mcp-builder"];

  /** Records one source for every name of the set. */
  function seedRunSource(repo = "acme/tools") {
    seedMockProvenance(
      Object.fromEntries(
        RUN_SOURCE.map((name) => [name, { repo, slug: name }]),
      ),
    );
  }

  /**
   * Answers the store-entry lookup with an entry per recorded source, so the
   * installed list carries the registry facts (a classification, a figure) it
   * cannot read off the disk. `downloads` names the ones that have a figure.
   */
  function seedStoreEntries(
    downloads: Record<string, number> = {},
    domain = "development",
  ) {
    lookupSkills.mockImplementation(
      async (refs: Array<{ repo: string; name: string }>) => ({
        entries: refs.map((ref) => ({
          name: ref.name,
          repo: ref.repo,
          description: `${ref.name} 的商店描述`,
          stars: 1200,
          downloads: downloads[ref.name] ?? 0,
          path: `skills/${ref.repo}/${ref.name}`,
          profile: { domain: [domain] },
        })),
      }),
    );
  }

  it("lists every install as its own row in the skill unit", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.click(screen.getByRole("button", { name: "按技能" }));

    // One row per install, uncapped: this is the whole list, so the unit that
    // reads it one skill at a time reads all of it.
    expect(
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(6);
    // No card, so no bar: nothing in this unit is a door to a repository.
    expect(screen.queryByRole("link", { name: /^查看仓库 / })).toBeNull();
    expect(screen.queryByRole("link", { name: /^查看本地安装/ })).toBeNull();
    // The enable switch rides the row, so both units manage the same skills.
    expect(screen.getAllByRole("switch")).toHaveLength(6);
  });

  it("files the skill unit's installs into one group per day, newest first", async () => {
    const user = userEvent.setup();
    // Every install is a tool install here; their mock ages spread across six
    // distinct days (0 / 3 / 12 / 45 / 200 / 400 days ago), so each lands in a
    // group of its own.
    const { container } = renderPage();
    await screen.findByText("pdf");

    await user.click(screen.getByRole("button", { name: "按技能" }));
    await screen.findAllByRole("button", { name: /查看 .+ 详情/ });

    // One group per day that holds an install, newest first; a day without an
    // install (昨天, say) renders nothing.
    const sections = [
      ...container.querySelectorAll("section[aria-label]"),
    ] as HTMLElement[];
    expect(sections.map((node) => node.getAttribute("aria-label"))).toEqual([
      "今天",
      dayTitle(3),
      dayTitle(12),
      dayTitle(45),
      dayTitle(200),
      dayTitle(400),
    ]);

    // One row in its own day: pdf landed today, docx three days ago, pptx
    // twelve.
    expect(
      within(sections[0]).getByRole("button", { name: "查看 pdf 详情" }),
    ).toBeInTheDocument();
    expect(
      within(sections[1]).getByRole("button", {
        name: "查看 docx 详情",
      }),
    ).toBeInTheDocument();
    expect(
      within(sections[2]).getByRole("button", {
        name: "查看 pptx 详情",
      }),
    ).toBeInTheDocument();

    // The old installs each head their own day, newest first: 45, then 200,
    // then 400 days ago.
    const rows = sections
      .slice(3)
      .map((section) =>
        within(section).getByRole("button", { name: /查看 .+ 详情/ }),
      )
      .map((node) => node.getAttribute("aria-label"));
    expect(rows).toEqual([
      "查看 mcp-builder 详情",
      "查看 code-review 详情",
      "查看 frontend-design 详情",
    ]);

    // Time groups replace the store-style run fold: no row hides behind one.
    expect(
      screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
    ).toBeNull();
  });

  it("labels each day group with quiet text, not a control", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");

    await user.click(screen.getByRole("button", { name: "按技能" }));
    await screen.findAllByRole("button", { name: /查看 .+ 详情/ });

    // A day group only names the order — nothing to act on — so today's
    // boundary is a small muted divider line, not a header to press: no fold,
    // no count badge, no control anywhere on the label.
    const today = screen.getByRole("region", { name: "今天" });
    expect(within(today).queryByRole("button", { name: /今天/ })).toBeNull();
    expect(within(today).queryByText(/个 skill/)).toBeNull();
    expect(within(today).getByText("今天")).toHaveClass(
      "text-xs",
      "text-muted-foreground/70",
    );
  });

  it("files one source's several installs by time instead of folding them", async () => {
    const user = userEvent.setup();
    // Four installs share one source the registry still lists: where the old
    // install-count ranking folded them behind one row, time filing lists every
    // one — they simply land in different days.
    seedRunSource();
    seedStoreEntries({ pdf: 30, docx: 20, pptx: 10, "mcp-builder": 5 });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "按技能" }));

    // Every install keeps its own row, across the day groups...
    expect(
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(6);
    // ...and no run fold survives from the store-style ranking.
    expect(
      screen.queryByRole("button", { name: /还有 \d+ 个来自/ }),
    ).toBeNull();
  });

  it("counts skills rather than repositories in the skill unit's chips", async () => {
    const user = userEvent.setup();
    seedMockProvenance({
      pdf: { repo: "anthropics/skills", slug: "pdf" },
      docx: { repo: "anthropics/skills", slug: "docx" },
    });
    seedStoreEntries({ pdf: 2991984, docx: 1991984 }, "content-creation");
    renderPage();

    // The repository unit weighs a domain by repositories: one source holds
    // both classified installs, so 内容创作 counts 1 beside 全部's 2 cards.
    const chip = await screen.findByRole("button", { name: /^内容创作/ });
    expect(chip).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
      "2",
    );

    await user.click(screen.getByRole("button", { name: "按技能" }));

    // The same chip now weighs skills, and 全部 every install.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^内容创作/ }),
      ).toHaveTextContent("2"),
    );
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
      "6",
    );

    // Scoping keeps the skills that belong to the domain, whoever they share a
    // source with: two is below the fold threshold, so each keeps its own row.
    await user.click(screen.getByRole("button", { name: /^内容创作/ }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(2),
    );

    // Switching units clears the scope with it: the two units weigh a domain
    // differently, so a scope set in one need not mean anything in the other.
    await user.click(screen.getByRole("button", { name: "按仓库" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent(
        "2",
      ),
    );
  });

  it("answers a search with rows in the skill unit", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "按技能" }));

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The match comes back as a row rather than a card, and as the only row: a
    // search re-answers the list by relevance in either unit.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(1),
    );
    expect(
      screen.getByRole("button", { name: "查看 pdf 详情" }),
    ).toBeInTheDocument();
  });

  it("walks the skill unit's newest-first time order in the detail drawer", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "按技能" }));

    // The walk follows the time filing: after today the order is mcp-builder
    // (45 days), code-review (200), frontend-design (400) — so one press from
    // code-review lands on frontend-design, never back on a newer install.
    await user.click(
      await screen.findByRole("button", { name: "查看 code-review 详情" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("code-review")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      await within(dialog).findByText("frontend-design"),
    ).toBeInTheDocument();
  });

  it("stands the category bar down while searching", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("pdf");
    expect(screen.getByRole("button", { name: /^全部/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // A search re-orders the list by relevance and ignores the scope, so the
    // bar goes away with it — exactly as it does in the store.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^全部/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("leads with the agent connections card into the agents graph", async () => {
    renderPage();

    // The old header avatar strip is now a full-width status card: it states
    // the detected/linked counts and the whole thing routes to the graph.
    const entry = await screen.findByRole("link", {
      name: "打开 agents 页面",
    });
    expect(entry).toHaveAttribute("href", "/my-skills/agents");
    expect(screen.getByText("Agent 连接")).toBeInTheDocument();
    expect(screen.getByText("已连接 3/5")).toBeInTheDocument();
  });
});
