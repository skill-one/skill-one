import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within, waitFor, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocalSkillsPage } from "./local-skills-page";
import { renderWithRouter } from "../../test/test-utils";
import { resetListView, setQuery } from "../../lib/list-view";
import {
  resetMockAgentStatus,
  resetMockInstalledSkills,
  setMockSkillEnabled,
  setMockSkillInstalledAt,
} from "../../lib/mock-local";
import { resetMockProvenance, seedMockProvenance } from "../../lib/provenance";
import { resetLinkSuggestions } from "../../lib/link-suggestions";

/** The page's back control and the debounce-free queries need a little room. */
configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates; the mock
// answers "nothing found" by default so the worker-less test env stays silent.
const { searchSkills, lookupSkills, registrySnapshot } = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  lookupSkills: vi.fn(),
  // One stable object: the hook reads it through useSyncExternalStore, which
  // treats a fresh snapshot on every call as an infinite render loop.
  registrySnapshot: { ready: true, epoch: 1 },
}));
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  resetLinkSuggestions();
});

const NAMES = [
  "pdf",
  "docx",
  "pptx",
  "mcp-builder",
  "code-review",
  "frontend-design",
];

describe("LocalSkillsPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
    resetMockProvenance();
    resetListView();
    window.localStorage.clear();
  });

  /** The pool's rows, as their detail buttons read, in document order. */
  const rowNames = async () =>
    (
      await screen.findAllByRole("button", { name: /查看 .+ 详情/ })
    ).map((button) => button.getAttribute("aria-label"));

  it("lists the pool whole, with the source stated once in the head", async () => {
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // Every install no source vouches for, uncapped — the page exists for the
    // rows the installed list's pool card folds behind its preview size.
    expect(
      await screen.findByRole("heading", { name: "本地安装" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("6 个 skill")).toBeInTheDocument();
    for (const name of NAMES) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(6);
    // An enumeration, not a ranking: the first row's number carries no medal.
    expect(screen.getByText("1").className).not.toContain("text-amber-500");
  });

  it("lists the pool newest install first, the order the card showed it in", async () => {
    // Stamp the installs so disk order (the mock's own listing) and install
    // time disagree — the card on the installed list reads them by time, so
    // the page does too, and a stampless record trails rather than keeping
    // its disk position.
    setMockSkillInstalledAt("pdf", 1_000);
    setMockSkillInstalledAt("docx", null);
    setMockSkillInstalledAt("pptx", 5_000);
    setMockSkillInstalledAt("mcp-builder", 3_000);
    setMockSkillInstalledAt("code-review", 4_000);
    setMockSkillInstalledAt("frontend-design", 2_000);
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    await waitFor(async () =>
      expect(await rowNames()).toHaveLength(NAMES.length),
    );
    // Install time desc: pptx, code-review, mcp-builder, frontend-design,
    // pdf; the stampless docx trails — exactly as it would trail on the card.
    expect(await rowNames()).toEqual([
      "查看 pptx 详情",
      "查看 code-review 详情",
      "查看 mcp-builder 详情",
      "查看 frontend-design 详情",
      "查看 pdf 详情",
      "查看 docx 详情",
    ]);
  });

  it("opens on the matches and folds the pool's other rows beneath a rule", async () => {
    const user = userEvent.setup();
    // The query is set before the page mounts, exactly the state the shared
    // search box is in when the pool card's door walks through to this page.
    setQuery("pdf");
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // Only the match is listed, with the matched term highlighted.
    await waitFor(async () =>
      expect(await rowNames()).toEqual(["查看 pdf 详情"]),
    );
    const match = screen
      .getByRole("button", { name: "查看 pdf 详情" })
      .closest("li") as HTMLElement;
    expect(match.querySelector("mark")).not.toBeNull();

    // The fold names exactly what unfolding adds.
    const fold = screen.getByRole("button", {
      name: "查看其他 5 个已安装 skill",
    });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(fold).toHaveAttribute("aria-controls", "pool-other-skills");

    // One press continues the pool beneath the match, in its own order
    // (newest install first), numbering on rather than starting over.
    await user.click(fold);
    await waitFor(async () => expect(await rowNames()).toHaveLength(6));
    expect(await rowNames()).toEqual([
      "查看 pdf 详情",
      "查看 docx 详情",
      "查看 pptx 详情",
      "查看 mcp-builder 详情",
      "查看 code-review 详情",
      "查看 frontend-design 详情",
    ]);
    expect(fold).toHaveTextContent("收起其他 5 个已安装 skill");

    // A second press folds the others away; the match is exactly as it was.
    await user.click(fold);
    await waitFor(async () =>
      expect(await rowNames()).toEqual(["查看 pdf 详情"]),
    );
  });

  it("widens to the ordinary pool when the query answers nothing", async () => {
    setQuery("nothing-the-pool-has");
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // No matches here: rather than opening on an empty answer, the page is
    // the pool whole, newest install first, with nothing folded.
    await waitFor(async () => expect(await rowNames()).toHaveLength(6));
    expect(await rowNames()).toEqual([
      "查看 pdf 详情",
      "查看 docx 详情",
      "查看 pptx 详情",
      "查看 mcp-builder 详情",
      "查看 code-review 详情",
      "查看 frontend-design 详情",
    ]);
    expect(
      screen.queryByRole("button", { name: /已安装 skill$/ }),
    ).toBeNull();
  });

  it("leaves a placed install to the installed list", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // pdf has a recorded source, so it belongs to its repository's card and not
    // to the pool: the pool holds the other five.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(5),
    );
    expect(screen.queryByText("pdf")).not.toBeInTheDocument();
    expect(screen.getByText("5 个 skill")).toBeInTheDocument();
  });

  it("carries an enable switch, and the disabled state, on every row", async () => {
    setMockSkillEnabled("pdf", false);
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // The same switch the installed list's rows carry, and the same dimming
    // that explains an off one.
    const off = await screen.findByRole("switch", { name: "开启 pdf" });
    expect(off.closest('[data-slot="card"]')).toHaveClass("opacity-60");
    // Six row switches, plus the head's one group switch over the whole pool.
    expect(screen.getAllByRole("switch")).toHaveLength(7);
    expect(
      screen.getByRole("switch", { name: "全部开启（本地安装）" }),
    ).toBeInTheDocument();
  });

  it("enables and disables the whole pool from the head's group switch", async () => {
    const user = userEvent.setup();
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // One press in the head is the press the card bar offered: every row
    // switch flips with it, and the rows dim together.
    await user.click(
      await screen.findByRole("switch", { name: "全部关闭（本地安装）" }),
    );
    for (const name of NAMES) {
      expect(
        await screen.findByRole("switch", { name: `开启 ${name}` }),
      ).toBeInTheDocument();
    }
    const group = screen.getByRole("switch", {
      name: "全部开启（本地安装）",
    });
    expect(group).toHaveAttribute("aria-checked", "false");

    // And back, in one press.
    await user.click(group);
    for (const name of NAMES) {
      expect(
        await screen.findByRole("switch", { name: `关闭 ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it("opens the same detail drawer the installed list uses", async () => {
    const user = userEvent.setup();
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
  });

  it("carries the way back to the installed list in its own head", async () => {
    // The way out is the page's head, beside the pool's identity — not the
    // window's chrome above it (see `DrillDownHead`).
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    const head = await screen.findByRole("heading", {
      name: "本地安装",
    });
    const back = screen.getByRole("link", { name: "返回" });
    expect(back).toHaveAttribute("href", "/my-skills");
    // One row holds both: the control leads, the identity follows.
    expect(
      head.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("shows the empty state when every install has a source", async () => {
    seedMockProvenance(
      Object.fromEntries(
        NAMES.map((name) => [name, { repo: "acme/tools", slug: name }]),
      ),
    );
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    expect(await screen.findByText("没有本地安装的 skill")).toBeInTheDocument();
  });
});
