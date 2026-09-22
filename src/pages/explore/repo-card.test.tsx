import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RepoCard } from "./repo-card";
import { useOwnerTint } from "../../hooks/use-owner-tint";
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

/** The tint is read off the owner elsewhere (`lib/owner-tint.test.ts`); here the
 *  question is only what the card does with one. */
vi.mock("../../hooks/use-owner-tint", () => ({ useOwnerTint: vi.fn() }));

const mockOwnerTint = vi.mocked(useOwnerTint);

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

/** Six skills, most installed first — one more than the card's cap, so the
 *  tail has something to account for. */
const skills: SearchHit[] = [
  hit("pdf", { downloads: 3_000, profile: { domain: ["office-productivity"] } }),
  hit("docx", { downloads: 2_000 }),
  hit("pptx", { downloads: 1_000 }),
  hit("xlsx", { downloads: 500 }),
  hit("slides", { downloads: 100 }),
  hit("canvas", { downloads: 10 }),
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
    .map((row) => row.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""));

describe("RepoCard", () => {
  beforeEach(() => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
    // Default: no colour for the owner — the state most cards are in, and the
    // state every card is in where there is nothing to read.
    mockOwnerTint.mockReturnValue(null);
  });

  it("leads with the skills and signs off with the repository's own bar", () => {
    const { container } = renderCard();

    // The skills are the card's content: no header stands between the reader
    // and the things they are comparing.
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
    expect(container.querySelector('[data-slot="card-content"]')).not.toBeNull();

    // The one bar carries what the repository is, how big it is, and the way
    // into its page.
    const bar = screen.getByRole("link", {
      name: `查看仓库 ${REPO}，6 个 skill`,
    });
    expect(bar).toHaveAttribute("href", `/repo/${REPO}`);
    expect(within(bar).getByText(REPO)).toBeInTheDocument();
    expect(within(bar).getByText(formatCount(STARS))).toBeInTheDocument();
    expect(within(bar).getByText("6 个")).toBeInTheDocument();
    expect(within(bar).getByText("全部")).toBeInTheDocument();
    // The printed star figure is compacted; the raw one stays reachable.
    expect(within(bar).getByTitle(`${STARS} stars`)).toBeInTheDocument();
    // The bar is the card's one repository-level control. A second link for the
    // same kind of choice — an "open on GitHub" button — used to sit beside it;
    // the repository page carries that action with a label instead.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("lists the repository's skills in order, under a glyph and a description", () => {
    renderCard();

    expect(rowNames()).toEqual(["pdf", "docx", "pptx", "xlsx"]);
    const pdf = screen.getByRole("button", { name: "查看 pdf 详情" });
    // The classification rides the row as its glyph, the name is the row's own
    // strong element, and the description follows it on the same line.
    expect(within(pdf).getByText("🗂️")).toBeInTheDocument();
    expect(pdf).toHaveTextContent("pdf does something useful.");
  });

  it("caps the list at four rows and states the repository's total", () => {
    renderCard();

    // Past the cap a skill is not rendered as a row...
    expect(screen.queryByText("slides")).not.toBeInTheDocument();
    expect(screen.queryByText("canvas")).not.toBeInTheDocument();
    // ...and the bar's figure is the repository's total, not the four on
    // screen: that is what makes a capped list read as "these of them", with
    // 全部 beside it as the way to the rest.
    const bar = screen.getByRole("link", {
      name: `查看仓库 ${REPO}，6 个 skill`,
    });
    expect(within(bar).getByText("6 个")).toBeInTheDocument();
    expect(bar).toHaveAttribute("href", `/repo/${REPO}`);
  });

  it("renders a one-skill repository with the same body and the same bar", () => {
    renderCard({ skills: [skills[0]] });

    expect(rowNames()).toEqual(["pdf"]);
    const bar = screen.getByRole("link", {
      name: `查看仓库 ${REPO}，1 个 skill`,
    });
    expect(within(bar).getByText("1 个")).toBeInTheDocument();
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
    ]);
  });

  it("opens one skill from its row and marks the row the panel shows", () => {
    const onOpenSkill = vi.fn();
    renderCard({ onOpenSkill, selected: skillKey(skills[1].skill) });

    fireEvent.click(screen.getByRole("button", { name: "查看 docx 详情" }));

    expect(onOpenSkill).toHaveBeenCalledWith(skillKey(skills[1].skill));
    expect(screen.getByRole("button", { name: "查看 docx 详情" })).toHaveAttribute(
      "aria-current",
      "true",
    );
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

    // Four always-on buttons would be the loudest thing on the card, so the
    // action waits for the row to be hovered or focused — but it stays in the
    // layout rather than being `hidden`, so the row keeps its height and
    // nothing shifts under the pointer.
    const install = screen.getAllByRole("button", { name: "安装" })[0];
    // The reveal rides the button's wrapper: the button owns `opacity` for its
    // own states (an installed one is `disabled:opacity-50`, which is more
    // specific than a bare `opacity-0` and would otherwise win).
    const reveal = install.parentElement as HTMLElement;
    expect(reveal).toHaveClass("opacity-0");
    expect(reveal).toHaveClass("group-hover/row:opacity-100");
    // Focus, either on the row or on the button inside it, reveals it too — so
    // a keyboard walk still sees the action of the row it stands on.
    expect(reveal).toHaveClass("group-focus-within/row:opacity-100");
    expect(install).not.toHaveClass("hidden");
    // Floating, not laid out: the row's name and description get its whole
    // width in the state a reader compares skills in, and the button dissolves
    // the text it covers rather than pushing it aside.
    expect(reveal).toHaveClass("absolute");
    expect(reveal).toHaveClass("bg-gradient-to-l");
    expect(screen.getAllByRole("button", { name: "查看 pdf 详情" })[0]).toHaveClass(
      "flex-1",
    );
  });

  it("renders exactly the plain card when the owner has no colour", () => {
    const { container } = renderCard();

    // The tint is decoration, so its absence is not a state: no marker, no
    // custom property, and the bar keeps the theme's own `bg-muted/50` rather
    // than a tint token. That last part is load-bearing: a token declared on
    // `:root` substitutes the colours it references once, on `:root`, so its
    // value would carry the *other* theme's wash into this one — a card with no
    // colour is exactly the card that must never go near it.
    const card = container.querySelector(`[data-repo="${REPO}"]`) as HTMLElement;
    const bar = container.querySelector('[data-slot="card-footer"]') as HTMLElement;
    expect(card).not.toHaveAttribute("data-owner-tint");
    expect(card.getAttribute("style")).toBeNull();
    expect(bar).toHaveClass("bg-muted/50");
    expect(bar).not.toHaveClass("bg-(--card-bar)");
  });

  it("hands the owner's colour to the card and its bar", () => {
    mockOwnerTint.mockReturnValue("#3b82f6");
    const { container } = renderCard();

    // The owner the tint is read for is the repository's own owner segment.
    expect(mockOwnerTint).toHaveBeenCalledWith("anthropics");

    // One custom property and one marker attribute: how much of that colour
    // reaches the card's surface and its bar — and how much lightness it is
    // allowed to take with it — lives in the stylesheet, not here.
    const card = container.querySelector(`[data-repo="${REPO}"]`) as HTMLElement;
    expect(card).toHaveAttribute("data-owner-tint");
    expect(card.style.getPropertyValue("--owner-tint")).toBe("#3b82f6");
  });

  it("keeps the card's single door: the bar, and nothing beside it", () => {
    renderCard();

    // Every route out of the card is a row (a skill) or the bar (the
    // repository): no control of the same granularity competes with either.
    expect(screen.queryByRole("button", { name: /GitHub/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
