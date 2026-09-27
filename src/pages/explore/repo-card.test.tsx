import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RepoCard } from "./repo-card";
import {
  fetchInstalledSkills,
  installSkillFromSource,
} from "../../lib/local-skills";
import { skillKey } from "../../lib/skill-view";
import { formatCount } from "../../lib/utils";
import type { SearchHit } from "../../lib/registry/protocol";
import type { Skill } from "../../types/skill";
import { renderWithRouter } from "../../test/test-utils";

vi.mock("../../lib/local-skills", () => ({
  fetchInstalledSkills: vi.fn(),
  installSkillFromSource: vi.fn(),
}));

const REPO = "anthropics/skills";
const STARS = 169_600;

/** One of the repository's skills, as the grouping hands it over: the skill
 *  plus the search terms to highlight (none outside a search). */
function hit(name: string, extras: Partial<Skill> = {}): SearchHit {
  return {
    skill: {
      name,
      repo: REPO,
      description: `${name} does something useful.`,
      stars: STARS,
      downloads: 1_000,
      path: `skills/${name}`,
      ...extras,
    },
    matched: {},
  };
}

/** Eight skills, most installed first — one more than the card's cap, so the
 *  tail has something to account for. */
const skills: SearchHit[] = [
  hit("pdf", {
    downloads: 3_000,
    profile: { domain: ["office-productivity"] },
  }),
  hit("docx", { downloads: 2_000 }),
  hit("pptx", { downloads: 1_000 }),
  hit("xlsx", { downloads: 500 }),
  hit("slides", { downloads: 400 }),
  hit("canvas", { downloads: 300 }),
  hit("figma", { downloads: 200 }),
  hit("notion", { downloads: 100 }),
];

/** The card as a list item, the way every surface mounts it. */
function renderCard(overrides: Parameters<typeof RepoCard>[0] | object = {}) {
  return renderWithRouter(
    <ul>
      <RepoCard
        repo={REPO}
        stars={STARS}
        skills={skills}
        onOpenSkill={() => {}}
        {...overrides}
      />
    </ul>,
  );
}

/** The card's rows, in DOM order, named by the label each one carries. */
const rowNames = () =>
  screen
    .getAllByRole("button", { name: /^查看 .+ 详情$/ })
    .map((row) =>
      row.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""),
    );

describe("RepoCard", () => {
  beforeEach(() => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  });

  it("leads with the repository's own bar and signs the rows under it", () => {
    const { container } = renderCard();

    // The bar leads the card: one line names the repository before any of its
    // rows do, and the rows follow under the hairline the bar closes with.
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header).not.toBeNull();
    expect(
      container.querySelector('[data-slot="card-content"]'),
    ).not.toBeNull();
    expect(header).toContainElement(
      screen.getByRole("button", {
        name: `展开 ${REPO} 的全部 8 个 skill`,
      }),
    );

    // This card's cap is holding rows back, so its one bar is the expansion
    // toggle: what the repository is, how big it is, and the offer of the rest
    // without leaving the list.
    const bar = screen.getByRole("button", {
      name: `展开 ${REPO} 的全部 8 个 skill`,
    });
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(within(bar).getByText(REPO)).toBeInTheDocument();
    expect(within(bar).getByText(formatCount(STARS))).toBeInTheDocument();
    // The toggle's figure is the *increment* — the exact number of rows a
    // press reveals, read straight off the five on screen.
    const offer = within(bar).getByText("3");
    expect(offer.tagName).toBe("SPAN");
    // ...and the repository's own figure rides the repository's own name, at
    // the front of the bar, rather than out in the offer's cluster — where it
    // mixed a fact about the repository with a fact about the list.
    const name = within(bar).getByText(REPO);
    const stars = within(bar).getByTitle(`${STARS} stars`);
    const follows = (first: Element, second: Element) =>
      (first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    expect(follows(name, stars)).toBe(true);
    expect(follows(stars, offer)).toBe(true);
    // The printed star figure is compacted; the raw one stays reachable.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("lists the repository's skills in order, under a glyph and a description", () => {
    renderCard();

    expect(rowNames()).toEqual(["pdf", "docx", "pptx", "xlsx", "slides"]);
    const pdf = screen.getByRole("button", { name: "查看 pdf 详情" });
    // The classification rides the row as its glyph, the name is the row's own
    // strong element, and the description follows it on the same line.
    expect(pdf.querySelector("svg.lucide-file-text")).toBeInTheDocument();
    expect(pdf).toHaveTextContent("pdf does something useful.");
  });

  it("caps the list at the default five rows and offers the rest on the bar", () => {
    renderCard();

    // The default preview holds five rows; past the cap a skill is not rendered.
    expect(rowNames()).toEqual(["pdf", "docx", "pptx", "xlsx", "slides"]);
    expect(screen.queryByText("canvas")).not.toBeInTheDocument();
    // The bar's figure is the *increment*: three rows behind the cap, which is
    // exactly what a press on the toggle reveals.
    const bar = screen.getByRole("button", {
      name: `展开 ${REPO} 的全部 8 个 skill`,
    });
    expect(within(bar).getByText("3")).toBeInTheDocument();
  });

  it("honours a smaller preview size", () => {
    renderCard({ maxSkills: 3 });

    expect(rowNames()).toEqual(["pdf", "docx", "pptx"]);
    expect(screen.queryByText("xlsx")).not.toBeInTheDocument();
  });

  it("honours a larger preview size", () => {
    renderCard({ maxSkills: 7 });

    expect(rowNames()).toHaveLength(7);
    expect(screen.getByText("figma")).toBeInTheDocument();
    expect(screen.queryByText("notion")).not.toBeInTheDocument();
  });

  it("renders a one-skill repository with the same body and the same bar", () => {
    renderCard({ skills: [skills[0]] });

    expect(rowNames()).toEqual(["pdf"]);
    // Nothing to reveal, so the bar is pure identity — and carries no figure:
    // a count would answer "how many are here?" for a card whose every row is
    // already on screen.
    expect(screen.queryByText(/个 skill/)).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("lists every match while a search is live, uncapped", () => {
    renderCard({ hasQuery: true });

    // The cap protects a browse from one big repository; under a search it
    // would hide hits the reader asked for, so it stands down.
    expect(rowNames()).toEqual([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "slides",
      "canvas",
      "figma",
      "notion",
    ]);
  });

  it("opens one skill from its row and marks the row the panel shows", () => {
    const onOpenSkill = vi.fn();
    renderCard({ onOpenSkill, selected: skillKey(skills[1].skill) });

    fireEvent.click(screen.getByRole("button", { name: "查看 docx 详情" }));

    expect(onOpenSkill).toHaveBeenCalledWith(skillKey(skills[1].skill));
    expect(
      screen.getByRole("button", { name: "查看 docx 详情" }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("button", { name: "查看 pdf 详情" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("puts the install button beside the row, never inside it", async () => {
    const user = userEvent.setup();
    const onOpenSkill = vi.fn();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderCard({ onOpenSkill });

    // Two sibling controls: the row opens the skill, the button installs it.
    // A button inside a button is invalid, and a click must never mean both.
    const row = screen.getByRole("button", { name: "查看 pdf 详情" });
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(row.parentElement?.querySelectorAll("button")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "安装" })[0]);

    expect(installSkillFromSource).toHaveBeenCalledWith(REPO, "pdf", {
      rev: undefined,
    });
    expect(onOpenSkill).not.toHaveBeenCalled();
  });

  it("keeps the install button out of the way until the row is pointed at", () => {
    renderCard();

    // A card's worth of always-on buttons would be the loudest thing on the
    // card, so the action waits for the row to be hovered or focused — but it
    // stays in the layout rather than being `hidden`, so the row keeps its
    // height and nothing shifts under the pointer.
    const install = screen.getAllByRole("button", { name: "安装" })[0];
    // The reveal rides the button's wrapper: the button owns `opacity` for its
    // own states (an installed one is `disabled:opacity-50`, which is more
    // specific than a bare `opacity-0` and would otherwise win).
    const reveal = install.parentElement as HTMLElement;
    expect(reveal).toHaveClass("opacity-0");
    expect(reveal).toHaveClass("group-hover/row:opacity-100");
    // An installed badge is a state rather than an invitation, so the wrapper
    // also reveals from the button's own `data-state` — the row below covers it.
    expect(reveal).toHaveClass("has-data-[state=installed]:opacity-100");
    // Focus, either on the row or on the button inside it, reveals it too — so
    // a keyboard walk still sees the action of the row it stands on.
    expect(reveal).toHaveClass("group-focus-within/row:opacity-100");
    expect(install).not.toHaveClass("hidden");
    // Floating, not laid out: the row's name and description get its whole
    // width in the state a reader compares skills in, and the button dissolves
    // the text it covers rather than pushing it aside.
    expect(reveal).toHaveClass("absolute");
    expect(reveal).toHaveClass("bg-gradient-to-l");
    expect(
      screen.getAllByRole("button", { name: "查看 pdf 详情" })[0],
    ).toHaveClass("flex-1");
  });

  it("keeps an installed skill's badge on screen without a hover", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderCard();

    await user.click(screen.getAllByRole("button", { name: "安装" })[0]);

    // Unlike the idle download, 已安装 is a fact rather than an invitation: the
    // wrapper reveals whenever the button carries a state, reading the button's
    // own `data-state` instead of waiting for the pointer.
    const installed = await screen.findByRole("button", { name: "已安装" });
    expect(installed).toHaveAttribute("data-state", "installed");
    const reveal = installed.parentElement as HTMLElement;
    expect(reveal).toHaveClass("has-data-[state=installed]:opacity-100");
  });

  it("keeps the card free of any route out of the list", () => {
    // A card whose cap hides nothing is a label: every route out of it is a
    // row (a skill, and the detail panel it opens), and no link competes with
    // that.
    renderCard({ skills: [skills[0]] });

    expect(screen.queryByRole("button", { name: /GitHub/ })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("offers no expansion when the cap hides nothing", () => {
    renderCard({ skills: [skills[0]] });

    // A one-skill repository has no rest to reveal, so its bar stays a label —
    // a toggle would only promise something it does not have.
    expect(
      screen.queryByRole("button", {
        name: `展开 ${REPO} 的全部 1 个 skill`,
      }),
    ).toBeNull();
    expect(screen.queryByText(/个 skill/)).toBeNull();
  });

  it("draws the owner face on a label bar whenever a repository stands behind it", () => {
    // A label bar (a card with nothing behind its cap) still knows its owner:
    // the face rides the name, resolving through the mirror and then GitHub's
    // own endpoint. The local pool — no repository at all — has no owner to
    // draw.
    const { container: labeled } = renderCard({ skills: [skills[0]] });
    expect(
      labeled.querySelector('[data-slot="card-header"] [data-slot="avatar"]'),
    ).not.toBeNull();

    const { container: pool } = renderCard({
      repo: "",
      skills: skills.map((h) => ({ skill: h.skill })),
    });
    expect(
      pool.querySelector('[data-slot="card-header"] [data-slot="avatar"]'),
    ).toBeNull();
  });

  it("draws no row control when the surface owns enablement itself", () => {
    renderCard({ rowActions: false });

    // The installed list's cards manage skills as a group from the bar: the
    // rows list skills without a corner on any of them.
    expect(screen.queryAllByRole("button", { name: "安装" })).toHaveLength(0);
  });

  it("mounts the footer action beside the bar, never inside it", async () => {
    const user = userEvent.setup();
    const onFooter = vi.fn();
    // One skill: no cap in play, so the bar stays a label and the test reads
    // the bar/action relationship it is about.
    const { container } = renderCard({
      skills: [skills[0]],
      rowActions: false,
      footerAction: (
        <button type="button" onClick={onFooter}>
          group
        </button>
      ),
    });

    // The footer action is its own control: a press on it must not also act on
    // the bar, so it is a sibling of the bar rather than a child of it.
    const bar = container.querySelector('[data-slot="card-header"] > span')!;
    const action = screen.getByRole("button", { name: "group" });
    expect(bar).toBeInTheDocument();
    expect(bar.contains(action)).toBe(false);
    await user.click(action);
    expect(onFooter).toHaveBeenCalledOnce();
  });

  it("expands in place past its cap, spanning the row in two balanced columns", async () => {
    const user = userEvent.setup();
    const { container } = renderCard();

    await user.click(
      screen.getByRole("button", {
        name: `展开 ${REPO} 的全部 8 个 skill`,
      }),
    );

    // The reveal: every skill the cap was holding, right here — no navigation.
    expect(rowNames()).toEqual([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "slides",
      "canvas",
      "figma",
      "notion",
    ]);

    // The open card takes the whole grid row, whatever the auto-fill came to.
    const item = container.querySelector("ul > li") as HTMLElement;
    expect(item).toHaveClass("col-span-full");

    // The body is one list laid out column-major over ceil(8/2) rows, so the
    // rows split evenly — four down the left, four down the right — and DOM
    // order (the reading order) stays most-installed first. The count puts two
    // columns on the grid; `auto-cols-fr` makes each half the card's width.
    const body = container.querySelector('[data-slot="card-content"] ul')!;
    expect(body).toHaveClass("grid");
    expect(body).toHaveClass("grid-flow-col");
    expect(body).toHaveClass("auto-cols-fr");
    expect(body).not.toHaveClass("flex-col");
    expect(body).toHaveStyle({ gridTemplateRows: "repeat(4, auto)" });

    // The toggle reads its own state: the figure becomes the card's total —
    // the fact the open card exists to show, beside the minus that folds it.
    const bar = screen.getByRole("button", {
      name: `收起 ${REPO} 的 skill 列表`,
    });
    expect(bar).toHaveAttribute("aria-expanded", "true");
    expect(within(bar).getByText("8 个 skill")).toBeInTheDocument();
    expect(within(bar).queryByText("3")).not.toBeInTheDocument();
  });

  it("folds back to the capped preview on a second press", async () => {
    const user = userEvent.setup();
    renderCard();

    const bar = () =>
      screen.getByRole("button", {
        name: `展开 ${REPO} 的全部 8 个 skill`,
      });
    await user.click(bar());
    await user.click(
      screen.getByRole("button", { name: `收起 ${REPO} 的 skill 列表` }),
    );

    expect(rowNames()).toEqual(["pdf", "docx", "pptx", "xlsx", "slides"]);
    expect(screen.queryByText("notion")).not.toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-expanded", "false");
  });

  it("offers no expansion while a search is live — the cap already stands down", () => {
    renderCard({ hasQuery: true });

    // A search's rows are matches; hiding one behind a toggle would defeat it.
    // With nothing held back the bar stays the plain label every
    // nothing-to-reveal card wears.
    expect(
      screen.queryByRole("button", {
        name: `展开 ${REPO} 的全部 8 个 skill`,
      }),
    ).toBeNull();
    expect(screen.queryByText(/个 skill/)).toBeNull();
  });
});
